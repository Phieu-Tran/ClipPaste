use super::helpers::clip_to_item_async;
use crate::database::Database;
use crate::models::{Clip, ClipboardItem};
use crate::utils;
use once_cell::sync::Lazy;
use std::collections::HashSet;
use std::fs;
use std::io::{Read as IoRead, Write as IoWrite};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
// `Manager` is only needed for `get_webview_window` in the Windows-only folder picker.
#[cfg(target_os = "windows")]
use tauri::Manager;

const DATA_DB_FILE: &str = "clipboard.db";
const DASHBOARD_STATS_CACHE_TTL: Duration = Duration::from_secs(5);
const MAX_IMPORT_ENTRIES: usize = 25_000;
const MAX_IMPORT_TOTAL_UNCOMPRESSED: u64 = 8 * 1024 * 1024 * 1024;
const MAX_IMPORT_DB_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const MAX_IMPORT_IMAGE_BYTES: u64 = 512 * 1024 * 1024;

static DASHBOARD_STATS_CACHE: Lazy<parking_lot::Mutex<Option<(Instant, serde_json::Value)>>> =
    Lazy::new(|| parking_lot::Mutex::new(None));

fn is_hex_hash(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|ch| ch.is_ascii_hexdigit())
}

fn is_safe_backup_image_filename(filename: &str) -> bool {
    if filename.is_empty()
        || filename.contains('/')
        || filename.contains('\\')
        || filename.chars().any(|ch| ch.is_control())
    {
        return false;
    }

    if let Some(hash) = filename.strip_suffix(".png") {
        return is_hex_hash(hash);
    }
    if let Some(hash) = filename.strip_suffix("_thumb.jpg") {
        return is_hex_hash(hash);
    }
    false
}

fn import_entry_relative_path(name: &str) -> Option<PathBuf> {
    if name.is_empty()
        || name.starts_with('/')
        || name.starts_with('\\')
        || name.contains('\\')
        || name.contains("..")
        || name.chars().any(|ch| ch.is_control())
    {
        return None;
    }

    if name == DATA_DB_FILE {
        return Some(PathBuf::from(DATA_DB_FILE));
    }

    let filename = name.strip_prefix("images/")?;
    if is_safe_backup_image_filename(filename) {
        return Some(PathBuf::from("images").join(filename));
    }

    None
}

fn import_file_size_limit(path: &Path) -> u64 {
    if path == Path::new(DATA_DB_FILE) {
        MAX_IMPORT_DB_BYTES
    } else {
        MAX_IMPORT_IMAGE_BYTES
    }
}

#[tauri::command]
pub fn get_data_directory() -> Result<String, String> {
    let config_path = utils::get_config_path();
    if let Ok(config_content) = std::fs::read_to_string(&config_path) {
        if let Ok(config) = serde_json::from_str::<serde_json::Value>(&config_content) {
            if let Some(custom_path) = config.get("data_directory").and_then(|v| v.as_str()) {
                return Ok(custom_path.to_string());
            }
        }
    }

    // Return default location
    let default_dir = utils::get_default_data_dir();
    Ok(default_dir.to_string_lossy().to_string())
}

fn save_data_directory_config(new_path: &str) -> Result<(), String> {
    let config_path = utils::get_config_path();
    if let Some(config_dir) = config_path.parent() {
        fs::create_dir_all(config_dir).ok();
    }

    let mut config = fs::read_to_string(&config_path)
        .ok()
        .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();
    config.insert(
        "data_directory".to_string(),
        serde_json::Value::String(new_path.to_string()),
    );

    let config_json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    fs::write(&config_path, config_json).map_err(|e| format!("Failed to save config: {}", e))
}

fn ensure_writable_directory(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|e| format!("Cannot create directory: {}", e))?;

    let probe = path.join(".clippaste-write-test");
    fs::write(&probe, b"ok").map_err(|e| format!("Directory is not writable: {}", e))?;
    let _ = fs::remove_file(probe);

    Ok(())
}

fn copy_file_replace(src: &Path, dst: &Path) -> Result<(), String> {
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Cannot create directory: {}", e))?;
    }
    fs::copy(src, dst)
        .map(|_| ())
        .map_err(|e| format!("Failed to copy {:?} to {:?}: {}", src, dst, e))
}

fn copy_image_files(src_images: &Path, stage_images: &Path) -> Result<(), String> {
    if !src_images.exists() {
        return Ok(());
    }

    fs::create_dir_all(stage_images).map_err(|e| format!("Cannot create image stage: {}", e))?;
    for entry in fs::read_dir(src_images).map_err(|e| format!("Cannot read images: {}", e))? {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        if !file_type.is_file() {
            continue;
        }
        copy_file_replace(&entry.path(), &stage_images.join(entry.file_name()))?;
    }

    Ok(())
}

fn install_staged_images(stage_images: &Path, target_images: &Path) -> Result<(), String> {
    if !stage_images.exists() {
        return Ok(());
    }

    fs::create_dir_all(target_images).map_err(|e| format!("Cannot create image dir: {}", e))?;
    for entry in
        fs::read_dir(stage_images).map_err(|e| format!("Cannot read staged images: {}", e))?
    {
        let entry = entry.map_err(|e| e.to_string())?;
        let dst = target_images.join(entry.file_name());
        if dst.exists() {
            continue;
        }
        copy_file_replace(&entry.path(), &dst)?;
    }

    Ok(())
}

async fn stage_current_data_for_target(
    db: &Database,
    current_data_dir: &Path,
    target_data_dir: &Path,
) -> Result<Option<PathBuf>, String> {
    let target_db = target_data_dir.join(DATA_DB_FILE);
    if target_db.exists() {
        log::info!(
            "Data directory target already has {}, switching without copying current data",
            DATA_DB_FILE
        );
        return Ok(None);
    }

    let source_db = current_data_dir.join(DATA_DB_FILE);
    if !source_db.exists() {
        return Ok(None);
    }

    let _ = sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(&db.pool)
        .await;

    let stamp = chrono::Local::now().format("%Y%m%d%H%M%S%3f");
    let stage_dir = target_data_dir.join(format!(".clippaste-migration-{}", stamp));
    let stage_db = stage_dir.join(DATA_DB_FILE);
    let stage_images = stage_dir.join("images");

    fs::create_dir_all(&stage_dir).map_err(|e| format!("Cannot create migration stage: {}", e))?;
    copy_file_replace(&source_db, &stage_db)?;
    copy_image_files(&current_data_dir.join("images"), &stage_images)?;

    Ok(Some(stage_dir))
}

fn install_staged_data(stage_dir: &Path, target_data_dir: &Path) -> Result<(), String> {
    let stage_db = stage_dir.join(DATA_DB_FILE);
    let target_db = target_data_dir.join(DATA_DB_FILE);
    let target_images = target_data_dir.join("images");

    install_staged_images(&stage_dir.join("images"), &target_images)?;
    copy_file_replace(&stage_db, &target_db)?;
    let _ = fs::remove_dir_all(stage_dir);

    Ok(())
}

#[tauri::command]
pub async fn set_data_directory(
    new_path: String,
    db: tauri::State<'_, Arc<Database>>,
    app: AppHandle,
) -> Result<(), String> {
    let new_path_buf = PathBuf::from(&new_path);

    // Security: reject relative paths
    if !new_path_buf.is_absolute() {
        return Err("Path must be absolute".to_string());
    }

    // Security: reject UNC/network paths
    if new_path.starts_with("\\\\") || new_path.starts_with("//") {
        return Err("Network paths are not supported".to_string());
    }

    // Security: reject path traversal
    let path_str = new_path_buf.to_string_lossy();
    if path_str.contains("..") {
        return Err("Path traversal is not allowed".to_string());
    }

    // Require a dedicated folder, not a drive root.
    if new_path_buf.parent().is_none() {
        return Err("Choose a dedicated folder, not a drive root".to_string());
    }

    // Ensure the target exists and is writable before staging data.
    ensure_writable_directory(&new_path_buf)?;

    let current_data_dir = db
        .images_dir
        .parent()
        .ok_or_else(|| "Cannot determine current data directory".to_string())?
        .to_path_buf();
    let same_dir = current_data_dir == new_path_buf;

    let stage_dir = if same_dir {
        None
    } else {
        stage_current_data_for_target(&db, &current_data_dir, &new_path_buf).await?
    };

    if let Some(stage) = &stage_dir {
        if let Err(e) = install_staged_data(stage, &new_path_buf) {
            let _ = fs::remove_dir_all(stage);
            return Err(e);
        }
    }

    save_data_directory_config(&new_path)?;

    log::info!("Data directory set to: {}", new_path);

    // Notify frontend that restart is needed
    let _ = app.emit(
        "data-directory-changed",
        &serde_json::json!({
            "message": "Data directory changed. Please restart the application.",
            "new_path": new_path
        }),
    );

    Ok(())
}

#[tauri::command]
pub async fn pick_file() -> Result<String, String> {
    use std::process::Command;
    #[cfg(target_os = "windows")]
    let path = {
        let ps_script = "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.OpenFileDialog; $d.Filter = 'Executables (*.exe)|*.exe|All files (*.*)|*.*'; $null = $d.ShowDialog(); $d.FileName";
        let output = Command::new("powershell")
            .args(["-NoProfile", "-Command", ps_script])
            .output()
            .map_err(|e| e.to_string())?;

        if output.status.success() {
            let p = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if p.is_empty() {
                return Err("No file selected".to_string());
            }
            p
        } else {
            return Err("Failed to open file picker".to_string());
        }
    };
    #[cfg(target_os = "macos")]
    let path = {
        let output = Command::new("osascript")
            .args(["-e", "POSIX path of (choose file)"])
            .output()
            .map_err(|e| e.to_string())?;
        if output.status.success() {
            let p = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if p.is_empty() {
                return Err("No file selected".to_string());
            }
            p
        } else {
            return Err("No file selected".to_string());
        }
    };
    #[cfg(target_os = "linux")]
    let path = {
        let output = Command::new("zenity")
            .args(["--file-selection"])
            .output()
            .map_err(|e| e.to_string())?;
        if output.status.success() {
            let p = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if p.is_empty() {
                return Err("No file selected".to_string());
            }
            p
        } else {
            return Err("No file selected".to_string());
        }
    };

    // Sanitize: reject path traversal and control characters
    if path.contains("..") || path.chars().any(|c| c.is_control()) {
        return Err("Invalid file path".to_string());
    }

    Ok(path)
}

#[tauri::command]
pub async fn pick_folder(app: AppHandle) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_INPROC_SERVER,
            COINIT_APARTMENTTHREADED,
        };
        use windows::Win32::UI::Shell::{
            FileOpenDialog, IFileOpenDialog, FOS_PICKFOLDERS, SIGDN_FILESYSPATH,
        };

        let hwnd = app
            .get_webview_window("main")
            .and_then(|w| w.hwnd().ok())
            .map(|h| HWND(h.0 as _))
            .unwrap_or(HWND(std::ptr::null_mut()));

        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

            // Use a closure so CoUninitialize is always called regardless of early returns
            let result = (|| -> Result<String, String> {
                let dialog: IFileOpenDialog =
                    CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)
                        .map_err(|e| format!("Failed to create dialog: {}", e))?;

                let options = dialog.GetOptions().map_err(|e| e.to_string())?;
                dialog
                    .SetOptions(options | FOS_PICKFOLDERS)
                    .map_err(|e| e.to_string())?;

                dialog
                    .Show(Some(hwnd))
                    .map_err(|_| "No folder selected".to_string())?;

                let item = dialog.GetResult().map_err(|e| e.to_string())?;
                let pwstr = item
                    .GetDisplayName(SIGDN_FILESYSPATH)
                    .map_err(|e| e.to_string())?;
                let path = pwstr.to_string().map_err(|e| e.to_string())?;
                CoTaskMemFree(Some(pwstr.0 as _));
                Ok(path)
            })();

            CoUninitialize();
            result
        }
    }
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        use std::process::Command;
        let output = Command::new("osascript")
            .args(["-e", "POSIX path of (choose folder)"])
            .output()
            .map_err(|e| e.to_string())?;
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if path.is_empty() {
                return Err("No folder selected".to_string());
            }
            Ok(path)
        } else {
            Err("No folder selected".to_string())
        }
    }
    #[cfg(target_os = "linux")]
    {
        let _ = app;
        use std::process::Command;
        let output = Command::new("zenity")
            .args(["--file-selection", "--directory"])
            .output()
            .map_err(|e| e.to_string())?;
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if path.is_empty() {
                return Err("No folder selected".to_string());
            }
            Ok(path)
        } else {
            Err("No folder selected".to_string())
        }
    }
}

#[tauri::command]
pub fn get_layout_config() -> serde_json::Value {
    serde_json::json!({
        "window_height": crate::constants::WINDOW_HEIGHT,
    })
}

#[tauri::command]
pub async fn export_data(
    _app: AppHandle,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<String, String> {
    // Let user pick save location (spawn blocking to avoid Tokio stall)
    #[cfg(target_os = "windows")]
    let save_path = {
        let ps_script = r#"Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.SaveFileDialog; $f.Filter = 'Zip Archive (*.zip)|*.zip'; $f.FileName = 'ClipPaste-backup.zip'; if ($f.ShowDialog() -eq 'OK') { $f.FileName } else { '' }"#;
        let output = tokio::task::spawn_blocking(move || {
            std::process::Command::new("powershell")
                .args(["-NoProfile", "-STA", "-Command", ps_script])
                .output()
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path.is_empty() {
            return Err("Export cancelled".to_string());
        }
        path
    };
    #[cfg(target_os = "macos")]
    let save_path = {
        let output = tokio::task::spawn_blocking(|| {
            std::process::Command::new("osascript")
                .args(["-e", r#"POSIX path of (choose file name with prompt "Export ClipPaste backup" default name "ClipPaste-backup.zip")"#])
                .output()
        }).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?;
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path.is_empty() {
            return Err("Export cancelled".to_string());
        }
        path
    };
    #[cfg(target_os = "linux")]
    let save_path = {
        let output = tokio::task::spawn_blocking(|| {
            std::process::Command::new("zenity")
                .args([
                    "--file-selection",
                    "--save",
                    "--filename=ClipPaste-backup.zip",
                ])
                .output()
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path.is_empty() {
            return Err("Export cancelled".to_string());
        }
        path
    };

    // Checkpoint WAL to ensure all data is in the main DB file
    let _ = sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(&db.pool)
        .await;

    let data_dir = db
        .images_dir
        .parent()
        .ok_or_else(|| "Cannot determine data directory".to_string())?
        .to_path_buf();
    let db_path = data_dir.join("clipboard.db");
    let images_dir = db.images_dir.clone();
    let save_path_clone = save_path.clone();

    // Copy DB to temp file first to avoid SQLite lock conflicts
    let temp_db = std::env::temp_dir().join("clippaste-export-temp.db");
    std::fs::copy(&db_path, &temp_db)
        .map_err(|e| format!("Failed to copy DB for export: {}", e))?;

    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let file = std::fs::File::create(&save_path_clone)
            .map_err(|e| format!("Failed to create zip: {}", e))?;
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        // Add DB file from temp copy
        if temp_db.exists() {
            let mut db_file =
                std::fs::File::open(&temp_db).map_err(|e| format!("Failed to read DB: {}", e))?;
            let mut buf = Vec::new();
            db_file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
            zip.start_file("clipboard.db", options)
                .map_err(|e| e.to_string())?;
            zip.write_all(&buf).map_err(|e| e.to_string())?;
            drop(db_file);
            let _ = std::fs::remove_file(&temp_db);
        }

        // Add images
        if images_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&images_dir) {
                for entry in entries.flatten() {
                    if let Ok(mut f) = std::fs::File::open(entry.path()) {
                        let name = format!("images/{}", entry.file_name().to_string_lossy());
                        let mut buf = Vec::new();
                        if f.read_to_end(&mut buf).is_ok() {
                            let _ = zip.start_file(&name, options);
                            let _ = zip.write_all(&buf);
                        }
                    }
                }
            }
        }

        zip.finish().map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())??;

    // Verify zip integrity by attempting to open and read the archive
    let verify_path = save_path.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let file = std::fs::File::open(&verify_path)
            .map_err(|e| format!("Export verification failed: cannot open zip: {}", e))?;
        let mut archive = zip::ZipArchive::new(file)
            .map_err(|e| format!("Export verification failed: invalid zip: {}", e))?;
        let has_db = (0..archive.len()).any(|i| {
            archive
                .by_index_raw(i)
                .map(|f| f.name() == "clipboard.db")
                .unwrap_or(false)
        });
        if !has_db {
            return Err(
                "Export verification failed: clipboard.db not found in archive".to_string(),
            );
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())??;

    log::info!("Exported backup to: {}", save_path);
    Ok(save_path)
}

async fn verify_imported_db(path: &Path) -> Result<(), String> {
    let options = sqlx::sqlite::SqliteConnectOptions::new().filename(path);
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(|e| format!("Imported DB cannot be opened: {}", e))?;

    let result: Result<String, _> = sqlx::query_scalar("PRAGMA integrity_check(1)")
        .fetch_one(&pool)
        .await;
    pool.close().await;

    match result {
        Ok(ref s) if s == "ok" => Ok(()),
        Ok(s) => Err(format!("Imported DB failed integrity_check: {}", s)),
        Err(e) => Err(format!("Imported DB integrity_check failed: {}", e)),
    }
}

#[tauri::command]
pub async fn import_data(
    app: AppHandle,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<(), String> {
    // Let user pick zip file (spawn blocking to avoid Tokio stall)
    #[cfg(target_os = "windows")]
    let zip_path = {
        let ps_script = r#"Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Filter = 'Zip Archive (*.zip)|*.zip'; if ($f.ShowDialog() -eq 'OK') { $f.FileName } else { '' }"#;
        let output = tokio::task::spawn_blocking(move || {
            std::process::Command::new("powershell")
                .args(["-NoProfile", "-STA", "-Command", ps_script])
                .output()
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path.is_empty() {
            return Err("Import cancelled".to_string());
        }
        path
    };
    #[cfg(target_os = "macos")]
    let zip_path = {
        let output = tokio::task::spawn_blocking(|| {
            std::process::Command::new("osascript")
                .args(["-e", r#"POSIX path of (choose file of type {"zip"} with prompt "Import ClipPaste backup")"#])
                .output()
        }).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?;
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path.is_empty() {
            return Err("Import cancelled".to_string());
        }
        path
    };
    #[cfg(target_os = "linux")]
    let zip_path = {
        let output = tokio::task::spawn_blocking(|| {
            std::process::Command::new("zenity")
                .args(["--file-selection", "--file-filter=*.zip"])
                .output()
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path.is_empty() {
            return Err("Import cancelled".to_string());
        }
        path
    };

    let data_dir = db
        .images_dir
        .parent()
        .ok_or_else(|| "Cannot determine data directory".to_string())?
        .to_path_buf();

    // Extract to a temp directory first to avoid overwriting the live DB
    let temp_dir = data_dir.join(".import_temp");
    let temp_dir_clone = temp_dir.clone();

    let extract_result = tokio::task::spawn_blocking(move || -> Result<(), String> {
        let file =
            std::fs::File::open(&zip_path).map_err(|e| format!("Failed to open zip: {}", e))?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Invalid zip: {}", e))?;

        if archive.len() > MAX_IMPORT_ENTRIES {
            return Err(format!(
                "Invalid backup: too many entries (max {})",
                MAX_IMPORT_ENTRIES
            ));
        }

        let mut has_db = false;
        let mut declared_total = 0u64;
        let mut seen_paths = HashSet::new();
        for i in 0..archive.len() {
            let entry = archive.by_index(i).map_err(|e| e.to_string())?;
            let name = entry.name().to_string();
            if name.ends_with('/') {
                continue;
            }

            let Some(rel_path) = import_entry_relative_path(&name) else {
                log::warn!("Import: skipping unexpected entry: {}", name);
                continue;
            };

            let path_key = rel_path.to_string_lossy().replace('\\', "/");
            if !seen_paths.insert(path_key.clone()) {
                return Err(format!("Invalid backup: duplicate entry {}", path_key));
            }

            let size = entry.size();
            let file_limit = import_file_size_limit(&rel_path);
            if size > file_limit {
                return Err(format!(
                    "Invalid backup: {} is too large ({} MB, max {} MB)",
                    name,
                    size / 1024 / 1024,
                    file_limit / 1024 / 1024
                ));
            }

            declared_total = declared_total
                .checked_add(size)
                .ok_or_else(|| "Invalid backup: total extracted size overflow".to_string())?;
            if declared_total > MAX_IMPORT_TOTAL_UNCOMPRESSED {
                return Err(format!(
                    "Invalid backup: extracted data is too large (max {} GB)",
                    MAX_IMPORT_TOTAL_UNCOMPRESSED / 1024 / 1024 / 1024
                ));
            }

            if rel_path == Path::new(DATA_DB_FILE) {
                has_db = true;
            }
        }

        if !has_db {
            return Err("Invalid backup: clipboard.db not found in zip".to_string());
        }

        // Clean and create temp dir
        let _ = std::fs::remove_dir_all(&temp_dir_clone);
        std::fs::create_dir_all(&temp_dir_clone)
            .map_err(|e| format!("Failed to create temp dir: {}", e))?;
        let temp_root = temp_dir_clone
            .canonicalize()
            .map_err(|e| format!("Failed to resolve temp dir: {}", e))?;

        // Extract safe backup entries only, streaming to disk so a large zip cannot
        // allocate the full uncompressed entry in memory.
        let mut extracted_total = 0u64;
        for i in 0..archive.len() {
            let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
            let name = entry.name().to_string();
            if name.ends_with('/') {
                continue;
            }

            let Some(rel_path) = import_entry_relative_path(&name) else {
                continue;
            };
            let out_path = temp_root.join(&rel_path);

            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create import directory: {}", e))?;
                let parent = parent
                    .canonicalize()
                    .map_err(|e| format!("Failed to resolve import directory: {}", e))?;
                if !parent.starts_with(&temp_root) {
                    return Err(format!("Invalid backup: path escapes import dir: {}", name));
                }
            } else {
                return Err(format!("Invalid backup: missing parent for {}", name));
            }

            let declared_size = entry.size();
            let file_limit = import_file_size_limit(&rel_path);
            let mut out_file = std::fs::File::create(&out_path)
                .map_err(|e| format!("Failed to create {}: {}", name, e))?;
            let written = std::io::copy(&mut entry.by_ref().take(file_limit + 1), &mut out_file)
                .map_err(|e| format!("Failed to extract {}: {}", name, e))?;
            if written > file_limit {
                let _ = std::fs::remove_file(&out_path);
                return Err(format!(
                    "Invalid backup: {} exceeded size limit while extracting",
                    name
                ));
            }
            if written != declared_size {
                let _ = std::fs::remove_file(&out_path);
                return Err(format!("Invalid backup: size mismatch for {}", name));
            }

            extracted_total = extracted_total
                .checked_add(written)
                .ok_or_else(|| "Invalid backup: total extracted size overflow".to_string())?;
            if extracted_total > MAX_IMPORT_TOTAL_UNCOMPRESSED {
                let _ = std::fs::remove_file(&out_path);
                return Err(format!(
                    "Invalid backup: extracted data exceeded {} GB",
                    MAX_IMPORT_TOTAL_UNCOMPRESSED / 1024 / 1024 / 1024
                ));
            }
        }

        // Validate extracted DB exists
        if !temp_dir_clone.join("clipboard.db").exists() {
            let _ = std::fs::remove_dir_all(&temp_dir_clone);
            return Err("Import failed: extracted clipboard.db not found".to_string());
        }

        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?;

    if let Err(e) = extract_result {
        let _ = std::fs::remove_dir_all(&temp_dir);
        return Err(e);
    }

    if let Err(e) = verify_imported_db(&temp_dir.join("clipboard.db")).await {
        let _ = std::fs::remove_dir_all(&temp_dir);
        return Err(e);
    }

    // Close the DB pool only after the backup has been extracted and validated.
    // This avoids leaving the app with a closed pool when the selected zip is invalid.
    db.pool.close().await;

    let data_dir_clone = data_dir.clone();
    let temp_dir_clone = temp_dir.clone();
    let install_result = tokio::task::spawn_blocking(move || -> Result<(), String> {
        // Stage the imported DB: rename current DB and place new one.
        // The app will restart after import, picking up the new DB.
        let src_db = temp_dir_clone.join("clipboard.db");
        let dst_db = data_dir_clone.join("clipboard.db");
        let backup_db = data_dir_clone.join("clipboard.db.pre-import");

        // Backup current DB (if import fails later, we can recover)
        if dst_db.exists() {
            let _ = std::fs::copy(&dst_db, &backup_db);
        }

        // Remove stale WAL/SHM from old DB before replacing
        let _ = std::fs::remove_file(dst_db.with_extension("db-wal"));
        let _ = std::fs::remove_file(dst_db.with_extension("db-shm"));

        // Copy new DB over the current one
        std::fs::copy(&src_db, &dst_db).map_err(|e| {
            // Restore backup on failure
            if backup_db.exists() {
                let _ = std::fs::copy(&backup_db, &dst_db);
            }
            format!("Failed to copy imported DB: {}", e)
        })?;

        // Move images
        let src_images = temp_dir_clone.join("images");
        if src_images.exists() {
            let dst_images = data_dir_clone.join("images");
            std::fs::create_dir_all(&dst_images).ok();
            if let Ok(entries) = std::fs::read_dir(&src_images) {
                for entry in entries.flatten() {
                    let dest = dst_images.join(entry.file_name());
                    let _ = std::fs::copy(entry.path(), dest);
                }
            }
        }

        // Cleanup temp dir
        let _ = std::fs::remove_dir_all(&temp_dir_clone);

        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?;

    if let Err(e) = install_result {
        let _ = std::fs::remove_dir_all(&temp_dir);
        return Err(e);
    }

    log::info!("Imported backup from zip");

    // Notify frontend to restart
    let _ = app.emit(
        "data-directory-changed",
        &serde_json::json!({
            "message": "Backup imported. Please restart the application.",
            "new_path": data_dir.to_string_lossy()
        }),
    );

    Ok(())
}

#[tauri::command]
pub async fn get_dashboard_stats(
    force_refresh: Option<bool>,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<serde_json::Value, String> {
    if !force_refresh.unwrap_or(false) {
        if let Some((created_at, cached)) = DASHBOARD_STATS_CACHE.lock().as_ref() {
            if created_at.elapsed() < DASHBOARD_STATS_CACHE_TTL {
                return Ok(cached.clone());
            }
        }
    }

    let pool = &db.pool;

    // Consolidate count queries into 1.
    let (
        total,
        today,
        images,
        text,
        folders,
        pinned,
        sensitive,
        in_folders,
        urls,
    ): (i64, i64, i64, i64, i64, i64, i64, i64, i64) = sqlx::query_as(
        "SELECT
            (SELECT COUNT(*) FROM clips) as total,
            (SELECT COUNT(*) FROM clips WHERE date(created_at,'localtime') = date('now','localtime')) as today,
            (SELECT COUNT(*) FROM clips WHERE clip_type = 'image') as images,
            (SELECT COUNT(*) FROM clips WHERE clip_type != 'image') as text,
            (SELECT COUNT(*) FROM folders) as folders,
            (SELECT COUNT(*) FROM clips WHERE is_pinned = 1) as pinned,
            (SELECT COUNT(*) FROM clips WHERE is_sensitive = 1) as sensitive,
            (SELECT COUNT(*) FROM clips WHERE folder_id IS NOT NULL) as in_folders,
            (SELECT COUNT(*) FROM clips WHERE subtype = 'url') as urls"
    ).fetch_one(pool).await.map_err(|e| e.to_string())?;

    // Clips per day (last 7 days)
    let daily: Vec<(String, i64)> = sqlx::query_as(
        "SELECT date(created_at, 'localtime') as day, COUNT(*) as count
         FROM clips WHERE date(created_at, 'localtime') >= date('now', 'localtime', '-6 days')
         GROUP BY date(created_at, 'localtime') ORDER BY day ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    // Top source apps (top 5)
    let top_apps: Vec<(String, i64)> = sqlx::query_as(
        "SELECT COALESCE(source_app, 'Unknown') as app, COUNT(*) as count
         FROM clips WHERE source_app IS NOT NULL
         GROUP BY source_app ORDER BY count DESC LIMIT 5",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    // Most pasted clips (top 5)
    let most_pasted: Vec<(String, String, i64)> = sqlx::query_as(
        "SELECT uuid, SUBSTR(text_preview, 1, 80), paste_count
         FROM clips WHERE paste_count > 0
         ORDER BY paste_count DESC LIMIT 5",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    // DB file size
    let db_path = db
        .images_dir
        .parent()
        .ok_or_else(|| "Cannot determine data directory".to_string())?
        .join("clipboard.db");
    let db_size = std::fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0);

    // Images dir size
    let mut images_size: u64 = 0;
    if let Ok(entries) = std::fs::read_dir(&db.images_dir) {
        for entry in entries.flatten() {
            images_size += entry.metadata().map(|m| m.len()).unwrap_or(0);
        }
    }

    let old_images_14d = db.preview_old_image_cleanup(14).await;

    let stats = serde_json::json!({
        "total": total,
        "today": today,
        "images": images,
        "text": text,
        "folders": folders,
        "pinned": pinned,
        "sensitive": sensitive,
        "in_folders": in_folders,
        "urls": urls,
        "daily": daily.iter().map(|(day, count)| {
            serde_json::json!({ "day": day, "count": count })
        }).collect::<Vec<_>>(),
        "top_apps": top_apps.iter().map(|(app, count)| {
            serde_json::json!({ "app": app, "count": count })
        }).collect::<Vec<_>>(),
        "most_pasted": most_pasted.iter().map(|(uuid, preview, count)| {
            serde_json::json!({ "id": uuid, "preview": preview, "count": count })
        }).collect::<Vec<_>>(),
        "db_size": db_size,
        "images_size": images_size,
        "old_images_14d": old_images_14d,
    });

    *DASHBOARD_STATS_CACHE.lock() = Some((Instant::now(), stats.clone()));

    Ok(stats)
}

#[tauri::command]
pub async fn get_clips_by_date(
    date: String,
    search: Option<String>,
    source_app: Option<String>,
    offset: Option<u32>,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<Vec<ClipboardItem>, String> {
    let pool = &db.pool;
    const PAGE: u32 = 100;
    let offset = offset.unwrap_or(0);

    let has_search = search.as_ref().is_some_and(|s| !s.is_empty());
    let has_app = source_app.as_ref().is_some_and(|s| !s.is_empty());

    let mut sql = String::from(
        "SELECT id, uuid, clip_type,
                CASE WHEN clip_type = 'image' THEN content ELSE '' END as content,
                text_preview, content_hash,
                folder_id, is_deleted, source_app, source_icon, metadata,
                created_at, last_accessed, last_pasted_at, is_pinned,
                subtype, note, paste_count, is_sensitive, updated_at
         FROM clips WHERE date(created_at, 'localtime') = ?",
    );
    if has_search {
        sql.push_str(" AND text_preview LIKE ?");
    }
    if has_app {
        sql.push_str(" AND source_app = ?");
    }
    sql.push_str(" ORDER BY created_at DESC LIMIT ? OFFSET ?");

    let mut query = sqlx::query_as::<_, Clip>(&sql).bind(&date);
    if has_search {
        query = query.bind(format!("%{}%", search.as_ref().unwrap()));
    }
    if has_app {
        query = query.bind(source_app.as_ref().unwrap());
    }
    query = query.bind(PAGE).bind(offset);

    let clips: Vec<Clip> = query.fetch_all(pool).await.map_err(|e| e.to_string())?;

    let mut items = Vec::with_capacity(clips.len());
    for clip in &clips {
        items.push(clip_to_item_async(clip, &db.images_dir, false).await);
    }

    Ok(items)
}

/// Run SQLite integrity check and return "ok" or the first error found.
#[tauri::command]
pub async fn check_db_integrity(db: tauri::State<'_, Arc<Database>>) -> Result<String, String> {
    let result: Result<String, _> = sqlx::query_scalar("PRAGMA integrity_check(1)")
        .fetch_one(&db.pool)
        .await;
    result.map_err(|e| e.to_string())
}

/// Get list of dates that have clips (for calendar highlighting)
#[tauri::command]
pub async fn get_clip_dates(
    db: tauri::State<'_, Arc<Database>>,
) -> Result<Vec<serde_json::Value>, String> {
    let pool = &db.pool;
    let dates: Vec<(String, i64)> = sqlx::query_as(
        "SELECT date(created_at, 'localtime') as day, COUNT(*) as count FROM clips
         GROUP BY date(created_at, 'localtime') ORDER BY day DESC LIMIT 365",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(dates
        .iter()
        .map(|(day, count)| serde_json::json!({ "date": day, "count": count }))
        .collect())
}
