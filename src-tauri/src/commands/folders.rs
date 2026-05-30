use crate::database::Database;
use crate::models::{Folder, FolderItem};
use std::sync::Arc;
use tauri::Emitter;

#[tauri::command]
pub async fn get_folders(db: tauri::State<'_, Arc<Database>>) -> Result<Vec<FolderItem>, String> {
    let pool = &db.pool;

    let folders: Vec<Folder> = sqlx::query_as(r#"SELECT * FROM folders ORDER BY position, id"#)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    // Get counts for all folders in one query
    let counts: Vec<(i64, i64)> = sqlx::query_as(
        r#"
        SELECT folder_id, COUNT(*) as count
        FROM clips
        WHERE folder_id IS NOT NULL
        GROUP BY folder_id
    "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    // Create a map for easier lookup
    use std::collections::HashMap;
    let count_map: HashMap<i64, i64> = counts.into_iter().collect();

    let items: Vec<FolderItem> = folders
        .iter()
        .map(|folder| FolderItem {
            id: folder.id.to_string(),
            name: folder.name.clone(),
            icon: folder.icon.clone(),
            color: folder.color.clone(),
            is_system: folder.is_system,
            item_count: *count_map.get(&folder.id).unwrap_or(&0),
        })
        .collect();

    Ok(items)
}

#[tauri::command]
pub async fn create_folder(
    name: String,
    icon: Option<String>,
    color: Option<String>,
    db: tauri::State<'_, Arc<Database>>,
    window: tauri::WebviewWindow,
) -> Result<FolderItem, String> {
    let pool = &db.pool;

    // Atomic insert — UNIQUE index on folders.name prevents duplicates without check-then-insert race
    let folder_uuid = uuid::Uuid::new_v4().to_string();
    let result = sqlx::query(r#"INSERT INTO folders (name, icon, color, uuid, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)"#)
        .bind(&name)
        .bind(icon.as_ref())
        .bind(color.as_ref())
        .bind(&folder_uuid)
        .execute(pool).await;

    let id = match result {
        Ok(r) => r.last_insert_rowid(),
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("UNIQUE constraint failed") {
                return Err("A folder with this name already exists".to_string());
            }
            return Err(msg);
        }
    };

    let _ = window.emit("clipboard-change", ());

    Ok(FolderItem {
        id: id.to_string(),
        name,
        icon,
        color,
        is_system: false,
        item_count: 0,
    })
}

#[tauri::command]
pub async fn delete_folder(
    id: String,
    db: tauri::State<'_, Arc<Database>>,
    window: tauri::WebviewWindow,
) -> Result<(), String> {
    let folder_id: i64 = id.parse().map_err(|_| "Invalid folder ID")?;
    delete_folder_records(&db, folder_id).await?;

    let _ = window.emit("clipboard-change", ());
    Ok(())
}

pub(crate) async fn delete_folder_records(
    db: &Database,
    folder_id: i64,
) -> Result<Option<String>, String> {
    let pool = &db.pool;

    let folder_uuid: Option<String> = sqlx::query_scalar("SELECT uuid FROM folders WHERE id = ?")
        .bind(folder_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    sqlx::query(
        "UPDATE clips SET folder_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE folder_id = ?",
    )
    .bind(folder_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM folders WHERE id = ?")
        .bind(folder_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;

    if let Some(ref folder_uuid) = folder_uuid {
        crate::sync::record_tombstone(db, folder_uuid, "folder")
            .await
            .ok();
    }

    crate::clipboard::load_search_cache(pool).await;

    Ok(folder_uuid)
}

#[tauri::command]
pub async fn rename_folder(
    id: String,
    name: String,
    color: Option<String>,
    icon: Option<String>,
    db: tauri::State<'_, Arc<Database>>,
    window: tauri::WebviewWindow,
) -> Result<(), String> {
    let pool = &db.pool;

    let folder_id: i64 = id.parse().map_err(|_| "Invalid folder ID")?;

    // Check availability
    let exists: Option<i64> =
        sqlx::query_scalar("SELECT 1 FROM folders WHERE name = ? AND id != ?")
            .bind(&name)
            .bind(folder_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;

    if exists.is_some() {
        return Err("A folder with this name already exists".to_string());
    }

    sqlx::query(r#"UPDATE folders SET name = ?, color = ?, icon = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"#)
        .bind(name)
        .bind(color)
        .bind(icon)
        .bind(folder_id)
        .execute(pool).await.map_err(|e| e.to_string())?;

    // Emit event so main window knows to refresh
    let _ = window.emit("clipboard-change", ());
    Ok(())
}

#[tauri::command]
pub async fn move_to_folder(
    clip_id: String,
    folder_id: Option<String>,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<(), String> {
    let pool = &db.pool;

    let folder_id = match folder_id {
        Some(id) => Some(id.parse::<i64>().map_err(|_| "Invalid folder ID")?),
        None => None,
    };

    sqlx::query(r#"UPDATE clips SET folder_id = ?, updated_at = CURRENT_TIMESTAMP WHERE uuid = ?"#)
        .bind(folder_id)
        .bind(&clip_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    // Update in-memory search cache with new folder_id (HashMap: uuid → (preview, folder_id, note))
    {
        let mut cache = crate::clipboard::SEARCH_CACHE.write();
        if let Some(entry) = cache.get_mut(&clip_id) {
            entry.folder_id = folder_id;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn move_folder_clips(
    source_folder_id: String,
    target_folder_id: Option<String>,
    db: tauri::State<'_, Arc<Database>>,
    window: tauri::WebviewWindow,
) -> Result<i64, String> {
    let source_id: i64 = source_folder_id
        .parse()
        .map_err(|_| "Invalid source folder ID")?;
    let target_id = match target_folder_id {
        Some(id) => Some(id.parse::<i64>().map_err(|_| "Invalid target folder ID")?),
        None => None,
    };
    if Some(source_id) == target_id {
        return Err("Source and target folders must be different".to_string());
    }

    let result = sqlx::query(
        "UPDATE clips SET folder_id = ?, updated_at = CURRENT_TIMESTAMP WHERE folder_id = ?",
    )
    .bind(target_id)
    .bind(source_id)
    .execute(&db.pool)
    .await
    .map_err(|e| e.to_string())?;

    crate::clipboard::load_search_cache(&db.pool).await;
    let _ = window.emit("clipboard-change", ());

    Ok(result.rows_affected() as i64)
}

#[tauri::command]
pub async fn merge_folder(
    source_folder_id: String,
    target_folder_id: String,
    db: tauri::State<'_, Arc<Database>>,
    window: tauri::WebviewWindow,
) -> Result<i64, String> {
    let source_id: i64 = source_folder_id
        .parse()
        .map_err(|_| "Invalid source folder ID")?;
    let target_id: i64 = target_folder_id
        .parse()
        .map_err(|_| "Invalid target folder ID")?;
    if source_id == target_id {
        return Err("Source and target folders must be different".to_string());
    }

    let source_uuid: Option<String> = sqlx::query_scalar("SELECT uuid FROM folders WHERE id = ?")
        .bind(source_id)
        .fetch_optional(&db.pool)
        .await
        .map_err(|e| e.to_string())?;
    if source_uuid.is_none() {
        return Err("Source folder not found".to_string());
    }

    let target_exists: Option<i64> = sqlx::query_scalar("SELECT 1 FROM folders WHERE id = ?")
        .bind(target_id)
        .fetch_optional(&db.pool)
        .await
        .map_err(|e| e.to_string())?;
    if target_exists.is_none() {
        return Err("Target folder not found".to_string());
    }

    let mut tx = db.pool.begin().await.map_err(|e| e.to_string())?;
    let moved = sqlx::query(
        "UPDATE clips SET folder_id = ?, updated_at = CURRENT_TIMESTAMP WHERE folder_id = ?",
    )
    .bind(target_id)
    .bind(source_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?
    .rows_affected() as i64;
    sqlx::query("DELETE FROM folders WHERE id = ?")
        .bind(source_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;

    if let Some(uuid) = source_uuid {
        crate::sync::record_tombstone(&db, &uuid, "folder")
            .await
            .ok();
    }
    crate::clipboard::load_search_cache(&db.pool).await;
    let _ = window.emit("clipboard-change", ());

    Ok(moved)
}

#[tauri::command]
pub async fn reorder_folders(
    folder_ids: Vec<String>,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<(), String> {
    let pool = &db.pool;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    for (idx, id) in folder_ids.iter().enumerate() {
        let folder_id: i64 = id.parse().map_err(|_| "Invalid folder ID")?;
        sqlx::query("UPDATE folders SET position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(idx as i64)
            .bind(folder_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::delete_folder_records;
    use crate::clipboard::{add_to_search_cache, SEARCH_CACHE};
    use crate::database::Database;

    async fn setup_test_db() -> Database {
        let temp_dir =
            std::env::temp_dir().join(format!("clippaste_folder_test_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let db_path = temp_dir.join("test.db");
        let db = Database::new(db_path.to_str().unwrap(), &temp_dir).await;
        db.migrate().await.expect("Migration should succeed");
        db
    }

    #[tokio::test]
    async fn delete_folder_moves_clips_to_all_and_keeps_clip_history() {
        let db = setup_test_db().await;
        sqlx::query(
            "INSERT INTO folders (uuid, name, updated_at) VALUES ('folder-delete-test', 'Work', CURRENT_TIMESTAMP)",
        )
        .execute(&db.pool)
        .await
        .unwrap();
        let folder_id: i64 =
            sqlx::query_scalar("SELECT id FROM folders WHERE uuid = 'folder-delete-test'")
                .fetch_one(&db.pool)
                .await
                .unwrap();

        sqlx::query(
            "INSERT INTO clips (uuid, clip_type, content, text_preview, content_hash, folder_id, is_deleted, is_pinned, created_at, last_accessed)
             VALUES ('clip-kept-after-folder-delete', 'text', 'hello', 'hello', 'hash-folder-delete', ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        )
        .bind(folder_id)
        .execute(&db.pool)
        .await
        .unwrap();
        add_to_search_cache("clip-kept-after-folder-delete", "hello", Some(folder_id));

        let deleted_uuid = delete_folder_records(&db, folder_id).await.unwrap();
        assert_eq!(deleted_uuid, Some("folder-delete-test".to_string()));

        let folder_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM folders WHERE id = ?")
            .bind(folder_id)
            .fetch_one(&db.pool)
            .await
            .unwrap();
        assert_eq!(folder_count, 0);

        let clip_folder: Option<i64> = sqlx::query_scalar(
            "SELECT folder_id FROM clips WHERE uuid = 'clip-kept-after-folder-delete'",
        )
        .fetch_one(&db.pool)
        .await
        .unwrap();
        assert_eq!(clip_folder, None);

        let folder_tombstones: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sync_tombstones WHERE uuid = 'folder-delete-test' AND entity_type = 'folder'",
        )
        .fetch_one(&db.pool)
        .await
        .unwrap();
        assert_eq!(folder_tombstones, 1);

        let clip_tombstones: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sync_tombstones WHERE uuid = 'clip-kept-after-folder-delete'",
        )
        .fetch_one(&db.pool)
        .await
        .unwrap();
        assert_eq!(clip_tombstones, 0);

        let cache = SEARCH_CACHE.read();
        let entry = cache
            .get("clip-kept-after-folder-delete")
            .expect("clip should remain searchable");
        assert_eq!(entry.folder_id, None);
    }
}
