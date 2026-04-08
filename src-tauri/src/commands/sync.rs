use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use crate::database::Database;
use crate::sync;

#[tauri::command]
pub async fn get_sync_status(db: tauri::State<'_, Arc<Database>>) -> Result<sync::models::SyncStatus, String> {
    Ok(sync::get_sync_status(&db).await)
}

#[tauri::command]
pub async fn get_sync_settings(db: tauri::State<'_, Arc<Database>>) -> Result<sync::models::SyncSettings, String> {
    Ok(sync::get_sync_settings(&db).await)
}

#[tauri::command]
pub async fn save_sync_settings(settings: sync::models::SyncSettings, db: tauri::State<'_, Arc<Database>>) -> Result<(), String> {
    sync::save_sync_settings(&db, &settings).await.map_err(|e| e.to_string())
}

/// Start the Google OAuth2 authorization flow.
#[tauri::command]
pub async fn gdrive_authorize(db: tauri::State<'_, Arc<Database>>, app: AppHandle) -> Result<String, String> {
    log::info!("SYNC: Starting Google Drive authorization...");
    let (tokens, email) = sync::oauth::authorize().await.map_err(|e| {
        log::error!("SYNC: Authorization failed: {}", e);
        e.to_string()
    })?;
    log::info!("SYNC: Authorization successful for {}", email);

    // Save tokens to DB
    let pool = &db.pool;
    save_setting(pool, "sync_access_token", &tokens.access_token).await?;
    save_setting(pool, "sync_refresh_token", &tokens.refresh_token).await?;
    save_setting(pool, "sync_token_expires_at", &tokens.expires_at.to_string()).await?;
    save_setting(pool, "sync_email", &email).await?;

    let _ = app.emit("sync-status-changed", ());

    Ok(email)
}

/// Disconnect Google Drive.
#[tauri::command]
pub async fn gdrive_disconnect(db: tauri::State<'_, Arc<Database>>, app: AppHandle) -> Result<(), String> {
    let pool = &db.pool;

    // Revoke token
    if let Ok(Some(token)) = db.get_setting("sync_access_token").await {
        sync::oauth::revoke_token(&token).await.ok();
    }

    // Clear all sync settings
    for key in &["sync_access_token", "sync_refresh_token", "sync_token_expires_at",
                  "sync_email", "sync_enabled", "sync_last_sync_at"] {
        let _ = sqlx::query("DELETE FROM settings WHERE key = ?")
            .bind(key).execute(pool).await;
    }

    // Stop auto-sync
    sync::stop_auto_sync();

    let _ = app.emit("sync-status-changed", ());

    Ok(())
}

/// Trigger a manual sync.
#[tauri::command]
pub async fn sync_now(db: tauri::State<'_, Arc<Database>>, app: AppHandle) -> Result<String, String> {
    let _ = app.emit("sync-status-changed", ());
    let result = sync::execute_sync(&db).await;
    let _ = app.emit("sync-status-changed", ());
    result
}

async fn save_setting(pool: &sqlx::SqlitePool, key: &str, value: &str) -> Result<(), String> {
    sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
        .bind(key).bind(value).execute(pool).await.map_err(|e| e.to_string())?;
    Ok(())
}
