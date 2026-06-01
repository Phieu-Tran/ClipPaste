use crate::database::Database;
use dark_light::Mode;
use std::str::FromStr;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

async fn save_setting_value(
    pool: &sqlx::SqlitePool,
    key: &str,
    value: impl ToString,
) -> Result<(), String> {
    sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
        .bind(key)
        .bind(value.to_string())
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to save setting {}: {}", key, e))?;
    Ok(())
}

#[tauri::command]
pub async fn get_settings(
    app: AppHandle,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<serde_json::Value, String> {
    use tauri_plugin_autostart::ManagerExt;
    let pool = &db.pool;

    let mut settings = serde_json::json!({
        "max_items": 0,
        "auto_delete_days": 0,
        "startup_with_windows": false, // Default, will override below
        "show_in_taskbar": false,
        "hotkey": "Ctrl+Shift+V",
        "theme": "dark",
        "mica_effect": "clear",
        "auto_paste": true,
        "ignore_ghost_clips": false,
        "image_auto_delete": false,
        "image_delete_days": 14
    });

    if let Ok(rows) = sqlx::query_as::<_, (String, String)>(r#"SELECT key, value FROM settings"#)
        .fetch_all(pool)
        .await
    {
        for (key, value) in rows {
            match key.as_str() {
                "mica_effect" | "theme" | "hotkey" => {
                    settings[&key] = serde_json::json!(value);
                }
                "ignore_ghost_clips" | "auto_paste" | "image_auto_delete" => {
                    if let Ok(b) = value.parse::<bool>() {
                        settings[&key] = serde_json::json!(b);
                    }
                }
                "max_items" | "auto_delete_days" | "image_delete_days" => {
                    if let Ok(num) = value.parse::<i64>() {
                        settings[&key] = serde_json::json!(num);
                    }
                }
                _ => {}
            }
        }
    }

    // Check actual autostart status
    if let Ok(is_enabled) = app.autolaunch().is_enabled() {
        settings["startup_with_windows"] = serde_json::json!(is_enabled);
        log::info!("autostart enabled: {}", is_enabled);
    } else {
        log::info!("autostart not enabled");
    }

    Ok(settings)
}

#[tauri::command]
pub async fn save_settings(
    app: AppHandle,
    settings: serde_json::Value,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let pool = &db.pool;

    if let Some(max_items) = settings.get("max_items").and_then(|v| v.as_i64()) {
        // 0 = unlimited, otherwise clamp to 10..100_000
        let max_items = if max_items <= 0 {
            0
        } else {
            max_items.clamp(10, 100_000)
        };
        save_setting_value(pool, "max_items", max_items).await?;
    }

    if let Some(days) = settings.get("auto_delete_days").and_then(|v| v.as_i64()) {
        // 0 = disabled, otherwise clamp to 1..3650
        let days = if days <= 0 { 0 } else { days.clamp(1, 3650) };
        save_setting_value(pool, "auto_delete_days", days).await?;
    }

    if let Some(enabled) = settings.get("image_auto_delete").and_then(|v| v.as_bool()) {
        save_setting_value(pool, "image_auto_delete", enabled).await?;
    }

    if let Some(days) = settings.get("image_delete_days").and_then(|v| v.as_i64()) {
        let days = if days <= 0 { 0 } else { days.clamp(1, 3650) };
        save_setting_value(pool, "image_delete_days", days).await?;
    }

    if let Some(theme) = settings.get("theme").and_then(|v| v.as_str()) {
        if matches!(theme, "light" | "dark" | "system") {
            save_setting_value(pool, "theme", theme).await?;
        } else {
            return Err(format!("Invalid theme: {}", theme));
        }
    }

    if let Some(mica_effect) = settings.get("mica_effect").and_then(|v| v.as_str()) {
        if matches!(
            mica_effect,
            "clear" | "mica" | "mica_alt" | "acrylic" | "blur"
        ) {
            save_setting_value(pool, "mica_effect", mica_effect).await?;
        } else {
            return Err(format!("Invalid mica_effect: {}", mica_effect));
        }
    }

    // Always re-apply window effect when theme or mica_effect might have changed
    let theme_str = settings
        .get("theme")
        .and_then(|v| v.as_str())
        .unwrap_or("system");
    let mica_effect = settings
        .get("mica_effect")
        .and_then(|v| v.as_str())
        .unwrap_or("clear");
    if let Some(win) = app.get_webview_window("main") {
        // get current system theme
        let current_theme = if theme_str == "light" {
            tauri::Theme::Light
        } else if theme_str == "dark" {
            tauri::Theme::Dark
        } else {
            let mode = dark_light::detect().map_err(|e| {
                log::error!(
                    "THEME: Failed to detect system theme: {:?} via dark_light::detect()",
                    e
                );
                e.to_string()
            })?;

            let theme2 = match mode {
                Mode::Dark => tauri::Theme::Dark,
                Mode::Light => tauri::Theme::Light,
                _ => tauri::Theme::Light,
            };

            log::info!(
                "THEME: win.theme(): {:?}, dark_light::detectd(): {:?}",
                win.theme(),
                theme2
            );

            // sometimes win.theme() is not right. don't why for now..
            // win.theme().unwrap_or_else(|err| {
            //     log::error!("THEME: Failed to get system theme: {:?}, defaulting to Light", err);
            //     tauri::Theme::Light
            // })
            theme2
        };
        log::info!(
            "THEME:Applying window effect: {} with theme: {:?} (setting:{:?}",
            mica_effect,
            current_theme,
            theme_str
        );
        crate::apply_window_effect(&win, mica_effect, &current_theme);
    }

    if let Some(hotkey) = settings.get("hotkey").and_then(|v| v.as_str()) {
        // Validate hotkey format before saving
        if Shortcut::from_str(hotkey).is_ok() {
            save_setting_value(pool, "hotkey", hotkey).await?;
        } else {
            return Err(format!("Invalid hotkey format: {}", hotkey));
        }
    }

    if let Some(auto_paste) = settings.get("auto_paste").and_then(|v| v.as_bool()) {
        save_setting_value(pool, "auto_paste", auto_paste).await?;
    }

    if let Some(ignore_ghost) = settings.get("ignore_ghost_clips").and_then(|v| v.as_bool()) {
        save_setting_value(pool, "ignore_ghost_clips", ignore_ghost).await?;
    }

    if let Some(startup) = settings
        .get("startup_with_windows")
        .and_then(|v| v.as_bool())
    {
        let current_state = app
            .autolaunch()
            .is_enabled()
            .map_err(|e| format!("Failed to read autostart state: {}", e))?;
        if startup != current_state {
            if startup {
                app.autolaunch()
                    .enable()
                    .map_err(|e| format!("Failed to enable autostart: {}", e))?;
            } else if let Err(e) = app.autolaunch().disable() {
                return Err(format!("Failed to disable autostart: {}", e));
            }
        }
    }

    // Reload settings cache after changes
    crate::clipboard::load_settings_cache(&db.pool).await;

    Ok(())
}

#[tauri::command]
pub async fn cleanup_old_image_clips(
    days: i64,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<u64, String> {
    let days = days.clamp(1, 3650);
    Ok(db.delete_old_image_clips(days).await)
}

#[tauri::command]
pub async fn preview_old_image_cleanup(
    days: i64,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<crate::database::ImageCleanupPreview, String> {
    let days = days.clamp(1, 3650);
    Ok(db.preview_old_image_cleanup(days).await)
}

#[tauri::command]
pub async fn cleanup_old_clips(
    days: i64,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<u64, String> {
    let days = days.clamp(1, 3650);
    Ok(db.delete_old_clips(days).await)
}

#[tauri::command]
pub async fn preview_old_clip_cleanup(
    days: i64,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<crate::database::ClipCleanupPreview, String> {
    let days = days.clamp(1, 3650);
    Ok(db.preview_old_clip_cleanup(days).await)
}

#[tauri::command]
pub async fn get_clipboard_history_size(
    db: tauri::State<'_, Arc<Database>>,
) -> Result<i64, String> {
    let pool = &db.pool;

    let count: i64 = sqlx::query_scalar::<_, i64>(r#"SELECT COUNT(*) FROM clips"#)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(count)
}

#[tauri::command]
pub async fn clear_clipboard_history(db: tauri::State<'_, Arc<Database>>) -> Result<(), String> {
    let pool = &db.pool;

    // Only delete soft-deleted clips that are NOT in any folder
    // No-op: soft delete no longer used, all deletes are hard deletes now
    // Kept for API compatibility
    sqlx::query(r#"SELECT 1"#)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn clear_all_clips(
    app: AppHandle,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<(), String> {
    use tauri::Emitter;
    let pool = &db.pool;

    // Clean up image files before deleting (skip pinned)
    let image_clips: Vec<(Vec<u8>,)> = sqlx::query_as(
        "SELECT content FROM clips WHERE folder_id IS NULL AND is_pinned = 0 AND clip_type = 'image'"
    ).fetch_all(pool).await.map_err(|e| e.to_string())?;
    for (content,) in &image_clips {
        let filename = String::from_utf8_lossy(content).into_owned();
        let image_path = db.images_dir.join(&filename);
        if image_path.exists() {
            let _ = std::fs::remove_file(&image_path);
        }
    }

    // Protect pinned clips from bulk clear
    sqlx::query("DELETE FROM clips WHERE folder_id IS NULL AND is_pinned = 0")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    // Rebuild in-memory search cache (deleted clips must be removed)
    crate::clipboard::load_search_cache(pool).await;
    // Optimize query planner after bulk delete
    let _ = sqlx::query("PRAGMA optimize").execute(pool).await;

    // Notify main window to refresh
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.emit("clipboard-change", ());
    }
    Ok(())
}

#[tauri::command]
pub async fn remove_duplicate_clips(db: tauri::State<'_, Arc<Database>>) -> Result<i64, String> {
    let pool = &db.pool;

    // Only remove duplicates from unprotected clips (not in folder, not pinned)
    let result = sqlx::query(
        r#"
        DELETE FROM clips
        WHERE folder_id IS NULL AND is_pinned = 0
        AND id NOT IN (
            SELECT MIN(id)
            FROM clips
            WHERE folder_id IS NULL AND is_pinned = 0
            GROUP BY content_hash
        )
    "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    // Rebuild in-memory search cache (deleted duplicates must be removed)
    if result.rows_affected() > 0 {
        crate::clipboard::load_search_cache(pool).await;
        let _ = sqlx::query("PRAGMA optimize").execute(pool).await;
    }

    Ok(result.rows_affected() as i64)
}

pub fn register_app_shortcuts(
    app: &AppHandle,
    db: Arc<Database>,
    main_hotkey: &str,
    scratchpad_hotkey: &str,
) -> Result<(), String> {
    let main_shortcut =
        Shortcut::from_str(main_hotkey).map_err(|e| format!("Invalid hotkey: {:?}", e))?;
    let (scratchpad_hotkey, scratchpad_shortcut) = match Shortcut::from_str(scratchpad_hotkey) {
        Ok(shortcut) => (scratchpad_hotkey.to_string(), shortcut),
        Err(e) => {
            log::warn!(
                "Invalid scratchpad hotkey {:?}: {:?}; falling back to Ctrl+Shift+S",
                scratchpad_hotkey,
                e
            );
            (
                "Ctrl+Shift+S".to_string(),
                Shortcut::from_str("Ctrl+Shift+S").map_err(|fallback_err| {
                    format!("Invalid fallback hotkey: {:?}", fallback_err)
                })?,
            )
        }
    };

    if main_hotkey.eq_ignore_ascii_case(&scratchpad_hotkey) {
        return Err("Main hotkey conflicts with scratchpad hotkey".to_string());
    }

    if let Err(e) = app.global_shortcut().unregister_all() {
        log::warn!("Failed to unregister existing shortcuts: {:?}", e);
    }

    let main_window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    let win_clone = main_window.clone();
    let db_for_main_hotkey = db.clone();
    app.global_shortcut()
        .on_shortcut(main_shortcut, move |_app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                let already_open = win_clone.is_visible().unwrap_or(false)
                    && win_clone.is_focused().unwrap_or(false);
                if already_open {
                    crate::animate_window_hide(&win_clone, None);
                } else {
                    if crate::clipboard::is_foreground_app_ignored(&db_for_main_hotkey) {
                        log::info!("HOTKEY: Suppressed (foreground app is ignored)");
                        return;
                    }
                    crate::clipboard::capture_prev_foreground();
                    crate::position_window_at_bottom(&win_clone);
                    let _ = win_clone.show();
                    let _ = win_clone.set_focus();
                }
            }
        })
        .map_err(|e| format!("Failed to register hotkey: {:?}", e))?;

    let app_for_sp = app.clone();
    let db_for_sp_hotkey = db;
    app.global_shortcut()
        .on_shortcut(scratchpad_shortcut, move |_app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                if crate::clipboard::is_foreground_app_ignored(&db_for_sp_hotkey) {
                    log::info!("HOTKEY: Scratchpad suppressed (foreground app is ignored)");
                    return;
                }
                crate::clipboard::capture_prev_foreground();
                if let Some(sp_win) = app_for_sp.get_webview_window("scratchpad") {
                    let _ = sp_win.show();
                    let _ = sp_win.emit("scratchpad-toggle", ());
                }
            }
        })
        .map_err(|e| format!("Failed to register scratchpad hotkey: {:?}", e))?;

    log::info!(
        "Registered global shortcuts: main={}, scratchpad={}",
        main_hotkey,
        scratchpad_hotkey
    );
    Ok(())
}

#[tauri::command]
pub async fn register_global_shortcut(
    hotkey: String,
    window: tauri::WebviewWindow,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<(), String> {
    let app = window.app_handle();
    let scratchpad_hotkey = db
        .get_setting("scratchpad_hotkey")
        .await
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| "Ctrl+Shift+S".to_string());

    register_app_shortcuts(app, db.inner().clone(), &hotkey, &scratchpad_hotkey)
}

#[tauri::command]
pub async fn add_ignored_app(
    app_name: String,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.add_ignored_app(&app_name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_ignored_app(
    app_name: String,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.remove_ignored_app(&app_name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_ignored_apps(db: tauri::State<'_, Arc<Database>>) -> Result<Vec<String>, String> {
    db.get_ignored_apps().await.map_err(|e| e.to_string())
}

/// Waits `delay_ms` (capped at 10s) then reads the current foreground window and returns
/// its app display name + exe filename. Used by the "target app" eyedropper in settings so
/// the user can pick an app to block without having to type the exe name.
#[tauri::command]
pub async fn pick_foreground_app(delay_ms: Option<u64>) -> Result<PickedApp, String> {
    let delay = delay_ms.unwrap_or(3000).min(10_000);
    tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
    crate::clipboard::get_foreground_app_info()
        .ok_or_else(|| "Could not read foreground app".to_string())
}

#[derive(serde::Serialize)]
pub struct PickedApp {
    pub app_name: Option<String>,
    pub exe_name: Option<String>,
    pub full_path: Option<String>,
}
