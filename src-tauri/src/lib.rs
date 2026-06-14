#![allow(non_snake_case)]
use std::fs;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::Arc;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};
use tauri_plugin_autostart::MacosLauncher;

#[cfg(target_os = "macos")]
use window_vibrancy_macos::{apply_vibrancy, NSVisualEffectMaterial};

#[cfg(target_os = "windows")]
use window_vibrancy::{
    apply_best_effect, apply_rounded_corners, clear_all_effects, switch_effect, CornerPreference,
    Effect,
};

static IS_ANIMATING: AtomicBool = AtomicBool::new(false);
static LAST_SHOW_TIME: AtomicI64 = AtomicI64::new(0);
static IS_DRAGGING: AtomicBool = AtomicBool::new(false);

/// RAII guard that resets IS_ANIMATING to false when dropped,
/// ensuring the flag is always cleared even if the thread panics.
struct AnimatingGuard;
impl Drop for AnimatingGuard {
    fn drop(&mut self) {
        IS_ANIMATING.store(false, Ordering::SeqCst);
    }
}

pub mod cli;
mod clipboard;
mod commands;
mod constants;
mod database;
mod models;
pub mod sync;
pub mod utils;

#[cfg(test)]
mod tests;

use database::Database;
use models::get_runtime;

fn configured_log_level() -> log::LevelFilter {
    let value = std::env::var("CLIPPASTE_LOG")
        .or_else(|_| std::env::var("RUST_LOG"))
        .unwrap_or_else(|_| "info".to_string())
        .to_ascii_lowercase();

    match value.as_str() {
        "trace" => log::LevelFilter::Trace,
        "debug" => log::LevelFilter::Debug,
        "warn" | "warning" => log::LevelFilter::Warn,
        "error" => log::LevelFilter::Error,
        "off" => log::LevelFilter::Off,
        _ => log::LevelFilter::Info,
    }
}

pub fn run_app() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();

    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_plugin_log::Builder::default().build());
    }

    let data_dir = get_data_dir();
    fs::create_dir_all(&data_dir).ok();

    // Migrate existing DB from old ClipPaste location if present.
    let old_data_dir = match dirs::data_dir() {
        Some(path) => path.join("ClipPaste"),
        None => std::env::current_dir()
            .unwrap_or(std::path::PathBuf::from("."))
            .join("ClipPaste"),
    };
    let old_db_path = old_data_dir.join("paste_paw.db");

    let db_path = data_dir.join("clipboard.db");
    if old_db_path.exists() && !db_path.exists() {
        if let Some(parent) = db_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        match fs::rename(&old_db_path, &db_path) {
            Ok(_) => log::info!("Migrated DB from {:?} to {:?}", old_db_path, db_path),
            Err(e) => {
                // fallback: try copy + remove
                match fs::copy(&old_db_path, &db_path) {
                    Ok(_) => {
                        let _ = fs::remove_file(&old_db_path);
                        log::info!("Copied old DB {:?} to {:?}", old_db_path, db_path);
                    }
                    Err(copy_err) => {
                        log::error!(
                            "Failed to migrate DB: rename error: {:?}, copy error: {:?}",
                            e,
                            copy_err
                        );
                    }
                }
            }
        }
    }

    let db_path_str = db_path.to_str().unwrap_or("clipboard.db").to_string();

    let rt = get_runtime().expect("Failed to get global tokio runtime");
    let _guard = rt.enter();

    // Check DB integrity before opening — auto-repair if corrupt
    if db_path.exists() {
        rt.block_on(async {
            Database::check_and_repair(&db_path_str, &data_dir).await;
        });
    }

    let db = rt.block_on(async { Database::new(&db_path_str, &data_dir).await });

    rt.block_on(async {
        if let Err(e) = db.migrate().await {
            log::error!("Database migration failed: {}", e);
        }
        db.cleanup_missing_image_clips().await;
    });

    let db_arc = Arc::new(db);

    let log_level = configured_log_level();
    let mut log_builder = tauri_plugin_log::Builder::default()
        .format(|out, message, record| {
            out.finish(format_args!(
                "[{}][{}][{}] {}",
                chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f"),
                record.target(),
                record.level(),
                message
            ))
        })
        .level(log_level);

    #[cfg(debug_assertions)]
    {
        log_builder = log_builder.targets([
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
        ]);
    }

    #[cfg(not(debug_assertions))]
    {
        log_builder = log_builder.targets([
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir { file_name: None }),
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
        ]);
    }

    builder
        .plugin(log_builder.build())
        .plugin(tauri_plugin_clipboard_x::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(db_arc.clone())
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::ThemeChanged(theme) => {
                    log::info!("THEME:System theme changed to: {:?}, win.theme(): {:?}", theme, window.theme());
                    let label = window.label().to_string();
                    let app_handle = window.app_handle().clone();
                    let db = window.state::<Arc<Database>>().inner().clone();
                    let theme_ = *theme;

                    tauri::async_runtime::spawn(async move {
                        let current_theme = db.get_setting("theme").await.ok().flatten().unwrap_or_else(|| "system".to_string());
                        let mica_effect = db.get_setting("mica_effect").await.ok().flatten().unwrap_or_else(|| "clear".to_string());

                        log::info!("THEME:Re-applying window effect due to theme change. Current theme setting: {:?}, system theme: {:?}, mica_effect setting: {:?}", current_theme, theme_, mica_effect);
                        // If app is set to follow system, we re-apply based on the NEW system theme
                        if current_theme == "system" {
                            if let Some(webview_win) = app_handle.get_webview_window(&label) {
                                crate::apply_window_effect(&webview_win, &mica_effect, &theme_);
                            }
                        }
                    });
                }
                tauri::WindowEvent::Focused(focused) => {
                    // Apply window effect to settings window on first focus
                    if *focused && window.label() == "settings" {
                        let app_handle = window.app_handle().clone();
                        let win = window.clone();
                        let db = window.state::<Arc<Database>>().inner().clone();
                        tauri::async_runtime::spawn(async move {
                            let theme_str = db.get_setting("theme").await.ok().flatten().unwrap_or_else(|| "system".to_string());
                            let mica_effect = db.get_setting("mica_effect").await.ok().flatten().unwrap_or_else(|| "clear".to_string());
                            let current_theme = if theme_str == "light" {
                                tauri::Theme::Light
                            } else if theme_str == "dark" {
                                tauri::Theme::Dark
                            } else {
                                win.theme().unwrap_or(tauri::Theme::Dark)
                            };
                            if let Some(settings_win) = app_handle.get_webview_window("settings") {
                                crate::apply_window_effect(&settings_win, &mica_effect, &current_theme);
                            }
                        });
                    }

                    if !focused {
                        let label = window.label();
                        // Only auto-hide the main window
                        if label == "main" {
                            if window.app_handle().get_webview_window("settings").is_some() {
                                // Settings window is open, keep main window visible
                                return;
                            }

                            // Debounce: Ignore blur events immediately after showing (500ms grace period)
                            let last_show = LAST_SHOW_TIME.load(Ordering::SeqCst);
                            let now = chrono::Local::now().timestamp_millis();
                            if now - last_show < 500 {
                                return;
                            }

                        if let Some(win) = window.app_handle().get_webview_window(label) {
                                 // Safety checks:
                                 // 1. If we are already animating (e.g. hiding via hotkey), don't interfere.
                                 if IS_ANIMATING.load(Ordering::SeqCst) {
                                     return;
                                 }
                                 // 1b. If user is dragging a clip to an external app, don't hide.
                                 if IS_DRAGGING.load(Ordering::SeqCst) {
                                     return;
                                 }
                                 // 2. If the window is not visible (e.g. just hidden programmatically), don't try to move/show it.
                                 if !win.is_visible().unwrap_or(false) {
                                     return;
                                 }

                                 // Check if cursor is on a different monitor
                                 let current_monitor = win.current_monitor().ok().flatten();
                                 let cursor_monitor = get_monitor_at_cursor(&win);

                                 let mut moved_screens = false;
                                 if let (Some(cm), Some(crm)) = (&current_monitor, &cursor_monitor) {
                                     // Compare monitor names or positions to see if they are different
                                     // Position is usually unique enough
                                     if cm.position().x != crm.position().x || cm.position().y != crm.position().y {
                                         moved_screens = true;
                                     }
                                 }

                                 if moved_screens {
                                     // User clicked on another screen, move window there immediately
                                     position_window_at_bottom(&win);
                                 } else {
                                     // Normal blur handling (hide)
                                     if win.is_visible().unwrap_or(false) {
                                         let win_clone = win.clone();
                                         std::thread::spawn(move || {
                                             crate::animate_window_hide(&win_clone, None);
                                         });
                                     }
                                 }
                            }
                        }
                    }
                }
                tauri::WindowEvent::Destroyed => {
                    // When settings window is destroyed, check if main window should be hidden.
                    // This handles the race condition where settings closes while main window's
                    // blur event was suppressed (get_webview_window("settings") returned Some
                    // during the brief destruction window).
                    if window.label() == "settings" {
                        let app_handle = window.app_handle().clone();
                        std::thread::spawn(move || {
                            // Small delay to let focus settle after settings window closes
                            std::thread::sleep(std::time::Duration::from_millis(100));
                            if let Some(main_win) = app_handle.get_webview_window("main") {
                                if !IS_ANIMATING.load(Ordering::SeqCst)
                                    && main_win.is_visible().unwrap_or(false)
                                    && !main_win.is_focused().unwrap_or(true)
                                {
                                    log::info!("Settings closed: main window visible but not focused, hiding.");
                                    crate::animate_window_hide(&main_win, None);
                                }
                            }
                        });
                    }
                }
                _ => {}
            }
        })
        .setup(move |app| {
            log::info!("ClipPaste starting...");
            log::info!("Database path: {}", db_path_str);
            if let Ok(log_dir) = app.path().app_log_dir() {
                log::info!("Log directory: {:?}", log_dir);
            }
            let handle = app.handle().clone();
            let db_for_clipboard = db_arc.clone();

            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Show ClipPaste", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let icon_data = include_bytes!("../icons/tray.png");
            let icon = Image::from_bytes(icon_data).map_err(|e| {
                log::info!("Failed to load icon: {:?}", e);
                e
            })?;

            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .tooltip("ClipPaste")
                .on_menu_event(move |app, event| {
                    if event.id.as_ref() == "quit" {
                        app.exit(0);
                    } else if event.id.as_ref() == "show" {
                        hide_scratchpad_window(app);
                        if let Some(win) = app.get_webview_window("main") {
                            position_window_at_bottom(&win);
                        }
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, .. } = event {
                        let app_handle = tray.app_handle();
                        hide_scratchpad_window(app_handle);
                        if let Some(win) = app_handle.get_webview_window("main") {
                            position_window_at_bottom(&win);
                        }
                    }
                })
                .build(app)?;

            let app_handle = handle.clone();
            let win = app_handle.get_webview_window("main")
                .ok_or("Main window not found during setup")?;

            #[cfg(target_os = "windows")]
            {
                let db_for_mica = db_for_clipboard.clone();
                let rt = get_runtime().expect("Tokio runtime not initialized for mica setup");
                let (mica_effect, theme) = rt.block_on(async {
                    let m = db_for_mica.get_setting("mica_effect").await.ok().flatten().unwrap_or_else(|| "clear".to_string());
                    let t = db_for_mica.get_setting("theme").await.ok().flatten().unwrap_or_else(|| "system".to_string());
                    (m, t)
                });

                // get current system theme
                let current_theme = if theme == "light" {
                    tauri::Theme::Light
                } else if theme == "dark" {
                    tauri::Theme::Dark
                } else {
                    win.theme().unwrap_or_else(|err| {
                        log::error!("THEME:Failed to get system theme: {:?}, defaulting to Light", err);
                        tauri::Theme::Light
                    })
                };

                log::info!("THEME:Applying window effect: {} with theme: {:?} (setting:{:?}", mica_effect, current_theme, theme);

                crate::apply_window_effect(&win, &mica_effect, &current_theme);
            }

            #[cfg(target_os = "macos")]
            let _ = apply_vibrancy(&win, NSVisualEffectMaterial::WindowBackground, None, None);

            // Load saved hotkeys from database or use defaults, then register the complete
            // shortcut set through the same path used by Settings.
            let db_for_shortcuts = db_for_clipboard.clone();
            let (saved_hotkey, scratchpad_hotkey) = get_runtime()
                .expect("Tokio runtime not initialized for hotkey setup")
                .block_on(async {
                    let main = db_for_shortcuts
                        .get_setting("hotkey")
                        .await
                        .ok()
                        .flatten()
                        .unwrap_or_else(|| "Ctrl+Shift+V".to_string());
                    let scratchpad = db_for_shortcuts
                        .get_setting("scratchpad_hotkey")
                        .await
                        .ok()
                        .flatten()
                        .unwrap_or_else(|| "Ctrl+Shift+S".to_string());
                    (main, scratchpad)
                });

            if let Err(e) = commands::register_app_shortcuts(
                &app_handle,
                db_for_clipboard.clone(),
                &saved_hotkey,
                &scratchpad_hotkey,
            ) {
                log::error!("Failed to register global shortcuts: {}", e);
            }

            let handle_for_clip = app_handle.clone();
            let db_for_clip = db_for_clipboard.clone();
            clipboard::init(&handle_for_clip, db_for_clip);

            // Load caches into memory for instant search + settings lookups.
            // Cleanup scans (orphan images, max_items, auto_delete) are deferred so the UI is
            // interactive ASAP — they run on a lower-priority background task after caches load.
            let db_for_cache = db_for_clipboard.clone();
            tauri::async_runtime::spawn(async move {
                clipboard::load_search_cache(&db_for_cache.pool).await;
                clipboard::load_settings_cache(&db_for_cache.pool).await;
                clipboard::load_app_icons_cache(&db_for_cache.pool).await;

                // Defer cleanup scans so they don't block the first render.
                let db_for_cleanup = db_for_cache.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    db_for_cleanup.enforce_max_items().await;
                    db_for_cleanup.enforce_auto_delete().await;
                    db_for_cleanup.enforce_image_auto_delete().await;
                    db_for_cleanup.cleanup_orphan_images().await;
                });
                // Rescan only when detection rules bumped — saves a full-table scan every launch.
                let stored_version: i64 = db_for_cache
                    .get_setting("detection_rules_version").await.ok().flatten()
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(0);
                if stored_version < clipboard::DETECTION_RULES_VERSION {
                    log::info!("RESCAN: detection_rules v{} < v{}, running full rescan",
                        stored_version, clipboard::DETECTION_RULES_VERSION);
                    db_for_cache.rescan_sensitive().await;
                    db_for_cache.rescan_subtypes().await;
                    let _ = sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES ('detection_rules_version', ?)")
                        .bind(clipboard::DETECTION_RULES_VERSION.to_string())
                        .execute(&db_for_cache.pool).await;
                    // Refresh cache so in-memory setting reflects the new version.
                    clipboard::load_settings_cache(&db_for_cache.pool).await;
                } else {
                    log::debug!("RESCAN: detection_rules v{} up to date, skipping", stored_version);
                }
            });

            // Periodic WAL checkpoint every 5 minutes — reduces data loss window on crash/force-kill
            let db_for_wal = db_arc.clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(300)).await;
                    if let Err(e) = sqlx::query("PRAGMA wal_checkpoint(PASSIVE)")
                        .execute(&db_for_wal.pool).await
                    {
                        log::warn!("Periodic WAL checkpoint failed: {}", e);
                    }
                }
            });

            // Start background auto-sync task
            let db_for_sync = db_arc.clone();
            sync::start_auto_sync(db_for_sync);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::get_clips,
            commands::get_clips_by_type_filter,
            commands::get_library_clips,
            commands::get_clip,
            commands::get_clip_image_data_url,
            commands::save_clip_image_as,
            commands::paste_clip,
            commands::paste_clips,
            commands::copy_clip,
            commands::delete_clip,
            commands::move_to_folder,
            commands::move_folder_clips,
            commands::merge_folder,
            commands::create_folder,
            commands::rename_folder,
            commands::delete_folder,
            commands::search_clips,
            commands::get_folders,
            commands::get_settings,
            commands::save_settings,
            commands::get_window_effect_support,
            commands::preview_old_image_cleanup,
            commands::cleanup_old_image_clips,
            commands::preview_old_clip_cleanup,
            commands::cleanup_old_clips,
            commands::hide_window,
            commands::get_clipboard_history_size,
            commands::clear_clipboard_history,
            commands::clear_all_clips,
            commands::remove_duplicate_clips,
            commands::register_global_shortcut,
            commands::show_window,
            commands::add_ignored_app,
            commands::remove_ignored_app,
            commands::get_ignored_apps,
            commands::pick_foreground_app,
            commands::pick_file,
            commands::get_layout_config,
            commands::test_log,
            commands::focus_window,
            commands::get_data_directory,
            commands::set_data_directory,
            commands::pick_folder,
            commands::reorder_folders,
            commands::toggle_pin,
            commands::paste_text,
            commands::set_dragging,
            commands::update_note,
            commands::set_clip_sensitive,
            commands::bulk_delete_clips,
            commands::bulk_move_clips,
            commands::bulk_set_pin,
            commands::export_data,
            commands::preview_import_backup,
            commands::import_data,
            commands::get_dashboard_stats,
            commands::get_clips_by_date,
            commands::get_clip_dates,
            commands::check_db_integrity,
            commands::toggle_incognito,
            commands::get_incognito_status,
            commands::get_initial_state,
            commands::rescan_sensitive,
            commands::rescan_subtypes,
            commands::get_sync_status,
            commands::get_sync_settings,
            commands::save_sync_settings,
            commands::gdrive_authorize,
            commands::gdrive_disconnect,
            commands::sync_now,
            commands::get_scratchpads,
            commands::create_scratchpad,
            commands::update_scratchpad,
            commands::delete_scratchpad,
            commands::reorder_scratchpads,
            commands::toggle_scratchpad_pin,
            commands::scratchpad_paste,
            commands::capture_prev_foreground,
            commands::get_runtime_diagnostics
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                let db = app_handle.state::<Arc<Database>>().inner().clone();
                if let Ok(rt) = get_runtime() {
                    rt.block_on(async move {
                        db.shutdown().await;
                    });
                }
            }
        });
}

pub fn position_window_at_bottom(window: &tauri::WebviewWindow) {
    animate_window_show(window);
}

fn hide_window_by_label(app: &tauri::AppHandle, label: &str) -> bool {
    if let Some(window) = app.get_webview_window(label) {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
            return true;
        }
    }
    false
}

pub fn hide_main_window(app: &tauri::AppHandle) -> bool {
    hide_window_by_label(app, "main")
}

pub fn hide_scratchpad_window(app: &tauri::AppHandle) -> bool {
    hide_window_by_label(app, "scratchpad")
}

pub fn animate_window_show(window: &tauri::WebviewWindow) {
    // Atomically check if false and set to true. If already true, return.
    if IS_ANIMATING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }

    LAST_SHOW_TIME.store(chrono::Local::now().timestamp_millis(), Ordering::SeqCst);

    let window = window.clone();
    std::thread::spawn(move || {
        let _guard = AnimatingGuard; // resets IS_ANIMATING on drop (even on panic)
        let monitor = get_monitor_at_cursor(&window);

        if let Some(monitor) = monitor {
            let scale_factor = monitor.scale_factor();
            let work_area = monitor.work_area();
            let window_height_px = (constants::WINDOW_HEIGHT * scale_factor) as u32;
            let window_margin_px = (constants::WINDOW_MARGIN * scale_factor) as i32;

            log::debug!(
                "Show: work_area pos=({},{}) size={}x{}, scale={}",
                work_area.position.x,
                work_area.position.y,
                work_area.size.width,
                work_area.size.height,
                scale_factor
            );

            let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
                width: work_area.size.width - (window_margin_px as u32 * 2),
                height: window_height_px,
            }));

            let target_y = work_area.position.y + (work_area.size.height as i32)
                - (window_height_px as i32)
                - window_margin_px;

            // Check if there's a monitor below. If so, skip slide-up animation
            // to prevent the window from briefly appearing on the lower monitor.
            #[cfg(target_os = "windows")]
            let skip_animation = has_adjacent_monitor_below(
                work_area.position.x,
                work_area.position.y + work_area.size.height as i32,
                work_area.size.width,
            );
            #[cfg(not(target_os = "windows"))]
            let skip_animation = false;

            ensure_window_on_current_virtual_desktop(&window);

            if skip_animation {
                // Position directly at target — no slide animation
                let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                    x: work_area.position.x + window_margin_px,
                    y: target_y,
                }));
                let _ = window.show();
                let _ = window.set_focus();
            } else {
                // Normal slide-up animation from bottom edge
                let start_y = work_area.position.y + (work_area.size.height as i32);

                let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                    x: work_area.position.x + window_margin_px,
                    y: start_y,
                }));

                let _ = window.show();
                let _ = window.set_focus();

                let steps = 15;
                let duration = std::time::Duration::from_millis(10);
                let dy = (target_y - start_y) as f64 / steps as f64;

                for i in 1..=steps {
                    let current_y = start_y as f64 + dy * i as f64;
                    let _ =
                        window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                            x: work_area.position.x + window_margin_px,
                            y: current_y as i32,
                        }));
                    std::thread::sleep(duration);
                }

                // Ensure final position is exact
                let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                    x: work_area.position.x + window_margin_px,
                    y: target_y,
                }));
            }
        }
        // IS_ANIMATING is reset by _guard on drop
    });
}

pub fn animate_window_hide(
    window: &tauri::WebviewWindow,
    on_done: Option<Box<dyn FnOnce() + Send>>,
) {
    // Atomically check if false and set to true. If already true, return.
    if IS_ANIMATING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }

    let window = window.clone();
    std::thread::spawn(move || {
        let _guard = AnimatingGuard; // resets IS_ANIMATING on drop (even on panic)
        if let Some(monitor) = window.current_monitor().ok().flatten() {
            let scale_factor = monitor.scale_factor();
            let work_area = monitor.work_area();

            let window_height_px = (constants::WINDOW_HEIGHT * scale_factor) as u32;
            let window_margin_px = (constants::WINDOW_MARGIN * scale_factor) as i32;

            let start_y = work_area.position.y + (work_area.size.height as i32)
                - (window_height_px as i32)
                - window_margin_px;
            let target_y = work_area.position.y + (work_area.size.height as i32); // Off screen

            // Check if there's a monitor below — if so, skip slide animation
            #[cfg(target_os = "windows")]
            let skip_animation = has_adjacent_monitor_below(
                work_area.position.x,
                work_area.position.y + work_area.size.height as i32,
                work_area.size.width,
            );
            #[cfg(not(target_os = "windows"))]
            let skip_animation = false;

            if !skip_animation {
                // Fix Z-Order: Dynamic Switch & Fade Out
                #[cfg(target_os = "windows")]
                {
                    use windows::core::PCWSTR;
                    use windows::Win32::Foundation::{HWND, RECT};
                    use windows::Win32::UI::WindowsAndMessaging::{
                        FindWindowW, GetWindowRect, SetWindowPos, SWP_NOACTIVATE, SWP_NOMOVE,
                        SWP_NOSIZE,
                    };

                    // 1. Find the Taskbar
                    let class_name: Vec<u16> = "Shell_TrayWnd"
                        .encode_utf16()
                        .chain(std::iter::once(0))
                        .collect();
                    let taskbar_hwnd =
                        unsafe { FindWindowW(PCWSTR(class_name.as_ptr()), PCWSTR::null()) }
                            .unwrap_or(HWND(std::ptr::null_mut()));

                    // 2. Get Taskbar Position (Top Y)
                    let mut taskbar_top_y = 0;
                    if !taskbar_hwnd.0.is_null() {
                        let mut rect = RECT::default();
                        if unsafe { GetWindowRect(taskbar_hwnd, &mut rect).is_ok() } {
                            taskbar_top_y = rect.top;
                        }
                    }

                    // 3. Initially Ensure Topmost
                    if let Ok(handle) = window.hwnd() {
                        let hwnd = HWND(handle.0 as _);
                        let hwnd_topmost = HWND(-1 as _); // HWND_TOPMOST
                        unsafe {
                            let _ = SetWindowPos(
                                hwnd,
                                Some(hwnd_topmost),
                                0,
                                0,
                                0,
                                0,
                                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                            );
                        }
                    }

                    let steps = 15;
                    let duration = std::time::Duration::from_millis(10);
                    let dy = (target_y - start_y) as f64 / steps as f64;

                    let mut z_order_switched = false;

                    for i in 1..=steps {
                        let current_y = start_y as f64 + dy * i as f64;
                        let _ = window.set_position(tauri::Position::Physical(
                            tauri::PhysicalPosition {
                                x: work_area.position.x + window_margin_px,
                                y: current_y as i32,
                            },
                        ));

                        // Dynamic Z-Order Switch: When we hit the taskbar, drop BEHIND it
                        if !z_order_switched
                            && taskbar_top_y > 0
                            && current_y as i32 >= taskbar_top_y
                        {
                            if let Ok(handle) = window.hwnd() {
                                let hwnd = HWND(handle.0 as _);
                                if !taskbar_hwnd.0.is_null() {
                                    unsafe {
                                        let _ = SetWindowPos(
                                            hwnd,
                                            Some(taskbar_hwnd),
                                            0,
                                            0,
                                            0,
                                            0,
                                            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                                        );
                                    }
                                    z_order_switched = true;
                                }
                            }
                        }
                        std::thread::sleep(duration);
                    }
                }

                #[cfg(not(target_os = "windows"))]
                {
                    let steps = 15;
                    let duration = std::time::Duration::from_millis(10);
                    let dy = (target_y - start_y) as f64 / steps as f64;

                    for i in 1..=steps {
                        let current_y = start_y as f64 + dy * i as f64;
                        let _ = window.set_position(tauri::Position::Physical(
                            tauri::PhysicalPosition {
                                x: work_area.position.x + window_margin_px,
                                y: current_y as i32,
                            },
                        ));
                        std::thread::sleep(duration);
                    }
                }
            }

            let _ = window.hide();

            // Clear TOPMOST after hiding so the window doesn't stay topmost
            // across virtual desktop switches (TOPMOST was set during slide animation).
            #[cfg(target_os = "windows")]
            if let Ok(handle) = window.hwnd() {
                use windows::Win32::Foundation::HWND;
                use windows::Win32::UI::WindowsAndMessaging::{
                    SetWindowPos, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
                };
                let hwnd = HWND(handle.0 as _);
                let hwnd_notopmost = HWND(-2 as _); // HWND_NOTOPMOST
                unsafe {
                    let _ = SetWindowPos(
                        hwnd,
                        Some(hwnd_notopmost),
                        0,
                        0,
                        0,
                        0,
                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                    );
                }
            }

            if let Some(callback) = on_done {
                callback();
            }
        }
        // IS_ANIMATING is reset by _guard on drop
    });
}

fn get_data_dir() -> std::path::PathBuf {
    // Check if custom data directory is set in config.json
    let config_path = utils::get_config_path();
    if let Ok(config_content) = fs::read_to_string(&config_path) {
        if let Ok(config) = serde_json::from_str::<serde_json::Value>(&config_content) {
            if let Some(custom_path) = config.get("data_directory").and_then(|v| v.as_str()) {
                let custom_path = std::path::PathBuf::from(custom_path);
                if custom_path.exists() || custom_path.parent().map(|p| p.exists()).unwrap_or(false)
                {
                    return custom_path;
                }
            }
        }
    }

    // Fallback to default location
    utils::get_default_data_dir()
}

/// Check if there is a monitor adjacent below the given bottom edge.
/// Used to decide whether slide-up animation is safe (won't leak onto another monitor).
#[cfg(target_os = "windows")]
fn has_adjacent_monitor_below(
    work_area_x: i32,
    work_area_bottom: i32,
    work_area_width: u32,
) -> bool {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::Graphics::Gdi::{MonitorFromPoint, MONITOR_DEFAULTTONULL};

    // Sample a few points along the bottom edge to check for a monitor below
    let check_points = [
        work_area_x + work_area_width as i32 / 2,  // center
        work_area_x + 10,                          // left side
        work_area_x + work_area_width as i32 - 10, // right side
    ];

    for x in check_points {
        let point = POINT {
            x,
            y: work_area_bottom + 1,
        };
        let hmon = unsafe { MonitorFromPoint(point, MONITOR_DEFAULTTONULL) };
        if !hmon.is_invalid() {
            return true;
        }
    }
    false
}

/// Move our hidden window to the user's current virtual desktop before showing it.
/// Without this, showing a window that was last visible on a different desktop causes
/// Windows to jump back to that old desktop.
///
/// Strategy: get the current desktop GUID via the foreground window (which is always
/// on the current desktop), then call IVirtualDesktopManager::MoveWindowToDesktop.
#[cfg(target_os = "windows")]
pub fn ensure_window_on_current_virtual_desktop(window: &tauri::WebviewWindow) {
    if let Ok(handle) = window.hwnd() {
        move_window_to_current_virtual_desktop(windows::Win32::Foundation::HWND(handle.0 as _));
    }
}

#[cfg(not(target_os = "windows"))]
pub fn ensure_window_on_current_virtual_desktop(_window: &tauri::WebviewWindow) {}

#[cfg(target_os = "windows")]
fn move_window_to_current_virtual_desktop(hwnd: windows::Win32::Foundation::HWND) {
    use windows::core::GUID;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::IVirtualDesktopManager;
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

    const CLSID_VIRTUAL_DESKTOP_MANAGER: GUID = GUID {
        data1: 0xAA509086,
        data2: 0x5CA9,
        data3: 0x4C25,
        data4: [0x8F, 0x95, 0x58, 0x9D, 0x3C, 0x07, 0xB4, 0x8A],
    };

    unsafe {
        // Initialize COM for this worker thread (idempotent if already initialized).
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

        let mgr: IVirtualDesktopManager =
            match CoCreateInstance(&CLSID_VIRTUAL_DESKTOP_MANAGER, None, CLSCTX_ALL) {
                Ok(m) => m,
                Err(e) => {
                    log::debug!("VD: IVirtualDesktopManager unavailable: {:?}", e);
                    return;
                }
            };

        // Get the current desktop GUID from the foreground window (always on current desktop).
        let fg = GetForegroundWindow();
        if fg.0.is_null() {
            log::debug!("VD: Foreground window unavailable; leaving desktop unchanged");
            return;
        }

        let desktop_id = match mgr.GetWindowDesktopId(fg) {
            Ok(id) => id,
            Err(e) => {
                log::debug!("VD: Failed to read foreground desktop id: {:?}", e);
                return;
            }
        };

        let _ = mgr.MoveWindowToDesktop(hwnd, &desktop_id);
        log::debug!("VD: Ensured ClipPaste window is on current virtual desktop");
    }
}

/// Monitor info obtained directly from Win32 APIs, avoiding coordinate system
/// mismatches between GetCursorPos (virtual screen coords) and Tauri's Monitor
/// (physical coords) that cause wrong monitor detection on multi-monitor setups
/// with different DPI scales.
#[cfg(target_os = "windows")]
pub struct CursorMonitorInfo {
    pub work_area_x: i32,
    pub work_area_y: i32,
    pub work_area_width: u32,
    pub work_area_height: u32,
    pub monitor_x: i32,
    pub monitor_y: i32,
    pub scale_factor: f64,
}

#[cfg(target_os = "windows")]
pub fn get_cursor_monitor_info() -> Option<CursorMonitorInfo> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

    let mut point = POINT { x: 0, y: 0 };
    unsafe { GetCursorPos(&mut point).ok()? };

    let hmonitor = unsafe { MonitorFromPoint(point, MONITOR_DEFAULTTONEAREST) };

    let mut mi = MONITORINFO {
        cbSize: std::mem::size_of::<MONITORINFO>() as u32,
        ..Default::default()
    };

    if !unsafe { GetMonitorInfoW(hmonitor, &mut mi).as_bool() } {
        return None;
    }

    let work = mi.rcWork;
    let mon = mi.rcMonitor;

    let mut dpi_x: u32 = 96;
    let mut dpi_y: u32 = 96;
    let _ = unsafe { GetDpiForMonitor(hmonitor, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y) };

    Some(CursorMonitorInfo {
        work_area_x: work.left,
        work_area_y: work.top,
        work_area_width: (work.right - work.left) as u32,
        work_area_height: (work.bottom - work.top) as u32,
        monitor_x: mon.left,
        monitor_y: mon.top,
        scale_factor: dpi_x as f64 / 96.0,
    })
}

pub fn get_monitor_at_cursor(window: &tauri::WebviewWindow) -> Option<tauri::Monitor> {
    #[cfg(target_os = "windows")]
    {
        // Use MonitorFromPoint via get_cursor_monitor_info to find the correct monitor,
        // then match against Tauri monitors by closest position.
        if let Some(info) = get_cursor_monitor_info() {
            if let Ok(monitors) = window.available_monitors() {
                let mut best: Option<tauri::Monitor> = None;
                let mut best_dist = i64::MAX;
                for m in monitors {
                    let pos = m.position();
                    let dx = (pos.x - info.monitor_x) as i64;
                    let dy = (pos.y - info.monitor_y) as i64;
                    let dist = dx * dx + dy * dy;
                    if dist < best_dist {
                        best_dist = dist;
                        best = Some(m);
                    }
                }
                if best.is_some() {
                    return best;
                }
            }
        }
        window.current_monitor().ok().flatten()
    }
    #[cfg(not(target_os = "windows"))]
    {
        window.current_monitor().ok().flatten()
    }
}

pub fn apply_window_effect(window: &tauri::WebviewWindow, effect: &str, theme: &tauri::Theme) {
    #[cfg(target_os = "windows")]
    {
        let dark = Some(matches!(theme, tauri::Theme::Dark));

        // Style presets are frontend surface treatments mapped onto native Windows effects.
        // Use switch_effect for flicker-free transitions (clears old effect first).
        match effect {
            "best" | "best_glow" => {
                let _ = clear_all_effects(window);
                let applied = apply_best_effect(window, dark);
                log::info!("THEME:Applied best effect {:?} (Theme: {})", applied, theme);
            }
            "clear" | "clear_focus" | "clear_neon" => {
                let _ = clear_all_effects(window);
                log::info!("THEME:All effects cleared");
            }
            "mica" | "mica_soft" => {
                let _ = switch_effect(window, Effect::Mica, dark, None);
                log::info!("THEME:Applied Mica effect (Theme: {})", theme);
            }
            "acrylic" | "acrylic_frost" | "acrylic_tint" => {
                let _ = switch_effect(window, Effect::Acrylic, dark, None);
                log::info!("THEME:Applied Acrylic effect (Theme: {})", theme);
            }
            "blur" | "blur_vivid" => {
                let _ = switch_effect(window, Effect::Blur, dark, None);
                log::info!("THEME:Applied Blur effect (Theme: {})", theme);
            }
            "mica_alt" | "mica_alt_luxe" => {
                let _ = switch_effect(window, Effect::Tabbed, dark, None);
                log::info!("THEME:Applied Tabbed/Mica Alt effect (Theme: {})", theme);
            }
            _ => {
                let _ = switch_effect(window, Effect::Tabbed, dark, None);
                log::info!(
                    "THEME:Unknown effect {}, falling back to Tabbed/Mica Alt (Theme: {})",
                    effect,
                    theme
                );
            }
        }

        // Apply native rounded corners on Win11
        let _ = apply_rounded_corners(window, CornerPreference::Round);
    }

    #[cfg(target_os = "macos")]
    {
        let _ = apply_vibrancy(window, NSVisualEffectMaterial::HudWindow, None, None);
        log::info!("THEME: Applied macOS vibrancy");
    }

    #[cfg(target_os = "linux")]
    {
        let _ = (window, effect, theme);
        // No window effects on Linux
    }
}
