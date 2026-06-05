use super::helpers::{
    check_auto_paste_and_hide, clip_to_item_async, clipboard_write_files, clipboard_write_image,
    clipboard_write_text,
};
use crate::database::Database;
use crate::models::{Clip, ClipboardItem};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

/// Shared ORDER BY for browsing a folder: pinned first, then noted items
/// (alphabetically by note), then newest copy first. Used by both `get_clips`
/// (folder path) and `get_clips_by_type_filter` so list order stays identical
/// whether or not a type filter is applied.
const FOLDER_BROWSE_ORDER_BY: &str = "ORDER BY is_pinned DESC,
         CASE WHEN note IS NOT NULL AND note != '' THEN 0 ELSE 1 END,
         CASE WHEN note IS NOT NULL AND note != '' THEN note ELSE NULL END,
         created_at DESC";

/// Fuzzy subsequence match: checks if all characters of `needle` appear in `haystack` in order,
/// but only matches if the characters are reasonably close together (not scattered across a long string).
/// Compactness ratio = needle_len / span. Must be >= 0.3 to avoid random garbage matches.
pub fn fuzzy_contains(haystack: &str, needle: &str) -> bool {
    let needle_len = needle.chars().count();
    if needle_len == 0 {
        return true;
    }
    if needle_len <= 2 {
        return haystack.contains(needle);
    } // too short for fuzzy

    let hay_chars: Vec<char> = haystack.chars().collect();
    let mut hay_idx = 0;
    let mut first_match: Option<usize> = None;
    let mut last_match = 0;

    for nc in needle.chars() {
        let mut found = false;
        while hay_idx < hay_chars.len() {
            if hay_chars[hay_idx] == nc {
                if first_match.is_none() {
                    first_match = Some(hay_idx);
                }
                last_match = hay_idx;
                hay_idx += 1;
                found = true;
                break;
            }
            hay_idx += 1;
        }
        if !found {
            return false;
        }
    }

    // Compactness check: matched characters shouldn't be too spread out
    let span = last_match - first_match.unwrap_or(0) + 1;
    let ratio = needle_len as f64 / span as f64;
    ratio >= 0.3 // at least 30% density
}

/// Edit distance between two strings (Levenshtein). Capped at `max_dist` for performance.
/// Returns None if distance exceeds max_dist (early termination).
fn edit_distance(a: &str, b: &str, max_dist: usize) -> Option<usize> {
    let a_len = a.chars().count();
    let b_len = b.chars().count();
    if a_len.abs_diff(b_len) > max_dist {
        return None;
    }

    let b_chars: Vec<char> = b.chars().collect();
    let mut prev: Vec<usize> = (0..=b_len).collect();
    let mut curr = vec![0usize; b_len + 1];

    for (i, ac) in a.chars().enumerate() {
        curr[0] = i + 1;
        let mut row_min = curr[0];
        for (j, &bc) in b_chars.iter().enumerate() {
            let cost = if ac == bc { 0 } else { 1 };
            curr[j + 1] = (prev[j] + cost).min(prev[j + 1] + 1).min(curr[j] + 1);
            row_min = row_min.min(curr[j + 1]);
        }
        if row_min > max_dist {
            return None;
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    let dist = prev[b_len];
    if dist <= max_dist {
        Some(dist)
    } else {
        None
    }
}

/// Check if any word in `haystack` approximately matches `needle` within allowed edit distance.
/// Allowed distance scales with word length: len<=3 → 0, len<=6 → 1, len>6 → 2.
fn approx_word_match(haystack: &str, needle: &str) -> bool {
    let max_dist = match needle.len() {
        0..=3 => 0, // short words: exact only
        4..=6 => 1, // medium: 1 typo
        _ => 2,     // long: 2 typos
    };
    if max_dist == 0 {
        return haystack.contains(needle);
    }
    // Check each word in haystack
    for word in haystack.split(|c: char| {
        c.is_whitespace() || c == '/' || c == '-' || c == '_' || c == '.' || c == ':'
    }) {
        if word.is_empty() {
            continue;
        }
        if edit_distance(word, needle, max_dist).is_some() {
            return true;
        }
    }
    false
}

#[tauri::command]
pub async fn get_clips(
    filter_id: Option<String>,
    limit: i64,
    offset: i64,
    preview_only: Option<bool>,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<Vec<ClipboardItem>, String> {
    let pool = &db.pool;
    let preview_only = preview_only.unwrap_or(false);

    log::debug!(
        "get_clips called with filter_id: {:?}, preview_only: {}",
        filter_id,
        preview_only
    );

    let clips: Vec<Clip> = match filter_id.as_deref() {
        Some("__frequent__") => {
            log::debug!("Querying for frequently pasted clips");
            sqlx::query_as(
                r#"
                SELECT id, uuid, clip_type,
                       CASE WHEN clip_type = 'image' THEN content ELSE X'' END as content,
                       text_preview, content_hash,
                       folder_id, is_deleted, source_app, source_icon, metadata,
                       created_at, last_accessed, last_pasted_at, is_pinned,
                       subtype, note, paste_count, is_sensitive, updated_at
                FROM clips WHERE paste_count >= 5
                ORDER BY paste_count DESC, created_at DESC
                LIMIT ? OFFSET ?
            "#,
            )
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?
        }
        Some("__smart__") => {
            // Smart ranking: paste_count weighted by recency (7-day halflife on last paste).
            // Pinned always first; only includes clips with at least 1 paste.
            log::debug!("Querying for smart-ranked clips");
            sqlx::query_as(r#"
                SELECT id, uuid, clip_type,
                       CASE WHEN clip_type = 'image' THEN content ELSE X'' END as content,
                       text_preview, content_hash,
                       folder_id, is_deleted, source_app, source_icon, metadata,
                       created_at, last_accessed, last_pasted_at, is_pinned,
                       subtype, note, paste_count, is_sensitive, updated_at
                FROM clips
                WHERE paste_count >= 1
                ORDER BY is_pinned DESC,
                         (CAST(paste_count AS REAL) /
                           (1.0 + (julianday('now') - julianday(COALESCE(last_pasted_at, created_at))) / 7.0)
                         ) DESC,
                         created_at DESC
                LIMIT ? OFFSET ?
            "#)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool).await.map_err(|e| e.to_string())?
        }
        Some(id) => {
            let folder_id_num = id.parse::<i64>().ok();
            if let Some(numeric_id) = folder_id_num {
                log::debug!("Querying for folder_id: {}", numeric_id);
                let sql = format!(
                    r#"
                    SELECT id, uuid, clip_type,
                           CASE WHEN clip_type = 'image' THEN content ELSE X'' END as content,
                           text_preview, content_hash,
                           folder_id, is_deleted, source_app, source_icon, metadata,
                           created_at, last_accessed, last_pasted_at, is_pinned,
                           subtype, note, paste_count, is_sensitive, updated_at
                    FROM clips WHERE folder_id = ?
                    {FOLDER_BROWSE_ORDER_BY}
                    LIMIT ? OFFSET ?
                "#
                );
                sqlx::query_as(&sql)
                    .bind(numeric_id)
                    .bind(limit)
                    .bind(offset)
                    .fetch_all(pool)
                    .await
                    .map_err(|e| e.to_string())?
            } else {
                log::debug!("Unknown folder_id, returning empty");
                Vec::new()
            }
        }
        None => {
            log::debug!("Querying for items, offset: {}, limit: {}", offset, limit);
            sqlx::query_as(
                r#"
                SELECT id, uuid, clip_type,
                       CASE WHEN clip_type = 'image' THEN content ELSE X'' END as content,
                       text_preview, content_hash,
                       folder_id, is_deleted, source_app, source_icon, metadata,
                       created_at, last_accessed, last_pasted_at, is_pinned,
                       subtype, note, paste_count, is_sensitive, updated_at
                FROM clips
                ORDER BY created_at DESC LIMIT ? OFFSET ?
            "#,
            )
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?
        }
    };

    log::debug!("DB: Found {} clips", clips.len());

    let mut items = Vec::with_capacity(clips.len());
    for (idx, clip) in clips.iter().enumerate() {
        if idx < 10 {
            let content_len = if clip.clip_type == "image" {
                if preview_only {
                    0
                } else {
                    clip.content.len()
                }
            } else {
                clip.text_preview.len()
            };
            log::trace!(
                "{} Clip {}: type='{}', content_len={}",
                idx,
                clip.uuid,
                clip.clip_type,
                content_len
            );
        }
        items.push(clip_to_item_async(clip, &db.images_dir, preview_only).await);
    }

    Ok(items)
}

#[tauri::command]
pub async fn get_clips_by_type_filter(
    type_filter: String,
    folder_id: Option<String>,
    limit: i64,
    offset: i64,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<Vec<ClipboardItem>, String> {
    let folder_filter = folder_id.as_deref().and_then(|id| id.parse::<i64>().ok());

    let mut sql = String::from(
        r#"
        SELECT id, uuid, clip_type,
               CASE WHEN clip_type = 'image' THEN content ELSE X'' END as content,
               text_preview, content_hash,
               folder_id, is_deleted, source_app, source_icon, metadata,
               created_at, last_accessed, last_pasted_at, is_pinned,
               subtype, note, paste_count, is_sensitive, updated_at
        FROM clips
        WHERE "#,
    );

    let mut subtype_param: Option<&str> = None;
    match type_filter.as_str() {
        "text" => sql.push_str("clip_type = 'text' AND subtype IS NULL"),
        "image" => sql.push_str("clip_type = 'image'"),
        "html" => sql.push_str("clip_type = 'html'"),
        "rtf" => sql.push_str("clip_type = 'rtf'"),
        "url" | "email" | "color" | "path" | "phone" | "ip" | "json" | "code" => {
            sql.push_str("subtype = ?");
            subtype_param = Some(type_filter.as_str());
        }
        _ => return Err("Invalid type filter".to_string()),
    }

    if folder_filter.is_some() {
        sql.push_str(" AND folder_id = ?");
        // Browsing inside a folder: mirror get_clips folder ordering exactly.
        sql.push('\n');
        sql.push_str(FOLDER_BROWSE_ORDER_BY);
    } else {
        // "All" view: mirror get_clips (None) ordering — newest copy first.
        sql.push_str("\nORDER BY created_at DESC");
    }
    sql.push_str(" LIMIT ? OFFSET ?");

    let mut query = sqlx::query_as::<_, Clip>(&sql);
    if let Some(subtype) = subtype_param {
        query = query.bind(subtype);
    }
    if let Some(fid) = folder_filter {
        query = query.bind(fid);
    }

    let clips = query
        .bind(limit.max(0))
        .bind(offset.max(0))
        .fetch_all(&db.pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::with_capacity(clips.len());
    for clip in &clips {
        items.push(clip_to_item_async(clip, &db.images_dir, false).await);
    }

    Ok(items)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn get_library_clips(
    query: Option<String>,
    folder_id: Option<String>,
    type_filter: Option<String>,
    pin_filter: Option<String>,
    date_filter: Option<String>,
    sort: Option<String>,
    limit: i64,
    offset: i64,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<Vec<ClipboardItem>, String> {
    let pool = &db.pool;
    let query = query.unwrap_or_default().trim().to_lowercase();
    let type_filter = type_filter
        .as_deref()
        .filter(|value| !value.is_empty() && *value != "all");
    let folder_filter = match folder_id.as_deref().filter(|value| !value.is_empty()) {
        Some("__smart__") | Some("__frequent__") => None,
        Some(id) => Some(id.parse::<i64>().map_err(|_| "Invalid folder ID")?),
        None => None,
    };

    let mut sql = String::from(
        "SELECT id, uuid, clip_type,
                CASE WHEN clip_type = 'image' THEN content ELSE X'' END as content,
                text_preview, content_hash,
                folder_id, is_deleted, source_app, source_icon, metadata,
                created_at, last_accessed, last_pasted_at, is_pinned,
                subtype, note, paste_count, is_sensitive, updated_at
         FROM clips WHERE 1=1",
    );

    let subtype_bind = append_type_filter_sql(&mut sql, "", type_filter)?;

    match folder_id.as_deref() {
        Some("__smart__") => sql.push_str(" AND paste_count >= 1"),
        Some("__frequent__") => sql.push_str(" AND paste_count >= 5"),
        _ => {}
    }

    if folder_filter.is_some() {
        sql.push_str(" AND folder_id = ?");
    }

    match pin_filter.as_deref().unwrap_or("all") {
        "pinned" => sql.push_str(" AND is_pinned = 1"),
        "unpinned" => sql.push_str(" AND is_pinned = 0"),
        "all" => {}
        _ => return Err("Invalid pin filter".to_string()),
    }

    match date_filter.as_deref().unwrap_or("all") {
        "today" => sql.push_str(" AND date(created_at, 'localtime') = date('now', 'localtime')"),
        "7d" => {
            sql.push_str(" AND datetime(created_at) >= datetime('now', 'localtime', '-7 days')");
        }
        "30d" => {
            sql.push_str(" AND datetime(created_at) >= datetime('now', 'localtime', '-30 days')");
        }
        "all" => {}
        _ => return Err("Invalid date filter".to_string()),
    }

    let query_words: Vec<&str> = query.split_whitespace().collect();
    if !query_words.is_empty() {
        sql.push_str(" AND (");
        for idx in 0..query_words.len() {
            if idx > 0 {
                sql.push_str(" AND ");
            }
            sql.push_str(
                "(LOWER(COALESCE(text_preview, '')) LIKE ?
                  OR LOWER(COALESCE(note, '')) LIKE ?
                  OR LOWER(COALESCE(source_app, '')) LIKE ?)",
            );
        }
        sql.push(')');
    }

    let order_by = match sort.as_deref().unwrap_or("newest") {
        "oldest" => "created_at ASC",
        "largest" => {
            "CASE
               WHEN clip_type = 'image' AND json_valid(COALESCE(metadata, '')) THEN
                 COALESCE(CAST(json_extract(metadata, '$.width') AS INTEGER), 0) *
                 COALESCE(CAST(json_extract(metadata, '$.height') AS INTEGER), 0)
               ELSE LENGTH(content)
             END DESC,
             created_at DESC"
        }
        "most_used" => {
            "paste_count DESC, COALESCE(last_pasted_at, created_at) DESC, created_at DESC"
        }
        "smart" => {
            "is_pinned DESC,
             (CAST(paste_count AS REAL) /
               (1.0 + (julianday('now') - julianday(COALESCE(last_pasted_at, created_at))) / 7.0)
             ) DESC,
             created_at DESC"
        }
        "newest" => "is_pinned DESC, created_at DESC",
        _ => return Err("Invalid sort".to_string()),
    };
    sql.push_str(" ORDER BY ");
    sql.push_str(order_by);
    sql.push_str(" LIMIT ? OFFSET ?");

    let mut db_query = sqlx::query_as::<_, Clip>(&sql);
    if let Some(subtype) = subtype_bind {
        db_query = db_query.bind(subtype);
    }
    if let Some(fid) = folder_filter {
        db_query = db_query.bind(fid);
    }
    for word in &query_words {
        let like = format!("%{}%", word);
        db_query = db_query.bind(like.clone()).bind(like.clone()).bind(like);
    }

    let clips = db_query
        .bind(limit.max(0))
        .bind(offset.max(0))
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::with_capacity(clips.len());
    for clip in &clips {
        items.push(clip_to_item_async(clip, &db.images_dir, false).await);
    }

    Ok(items)
}

#[tauri::command]
pub async fn get_clip(
    id: String,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<ClipboardItem, String> {
    let pool = &db.pool;

    let clip: Option<Clip> = sqlx::query_as(r#"SELECT * FROM clips WHERE uuid = ?"#)
        .bind(&id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;

    match clip {
        Some(clip) => {
            let content_str = if clip.clip_type == "image" {
                use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
                let filename = String::from_utf8_lossy(&clip.content).into_owned();
                let image_path = db.images_dir.join(&filename);
                match std::fs::read(&image_path) {
                    Ok(bytes) => BASE64.encode(&bytes),
                    Err(_) => String::new(),
                }
            } else {
                String::from_utf8_lossy(&clip.content).into_owned()
            };

            Ok(ClipboardItem {
                id: clip.uuid,
                clip_type: clip.clip_type,
                content: content_str,
                preview: clip.text_preview,
                folder_id: clip.folder_id.map(|id| id.to_string()),
                created_at: clip.created_at.to_rfc3339(),
                source_app: clip.source_app,
                source_icon: clip.source_icon,
                metadata: clip.metadata,
                is_pinned: clip.is_pinned,
                subtype: clip.subtype,
                note: clip.note,
                paste_count: clip.paste_count,
                is_sensitive: clip.is_sensitive,
                thumbnail: None,
            })
        }
        None => Err("Clip not found".to_string()),
    }
}

#[tauri::command]
pub async fn get_clip_image_data_url(
    id: String,
    thumbnail: bool,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};

    let row: Option<(String, Vec<u8>, String)> =
        sqlx::query_as("SELECT clip_type, content, content_hash FROM clips WHERE uuid = ?")
            .bind(&id)
            .fetch_optional(&db.pool)
            .await
            .map_err(|e| e.to_string())?;

    let Some((clip_type, content, content_hash)) = row else {
        return Err("Clip not found".to_string());
    };

    if clip_type != "image" {
        return Err("Clip is not an image".to_string());
    }

    let filename = String::from_utf8_lossy(&content).into_owned();
    if !is_safe_image_filename(&filename) {
        return Err("Invalid image filename".to_string());
    }

    let full_path = db.images_dir.join(&filename);
    let mut candidates = Vec::new();
    if thumbnail {
        let thumb_filename = format!("{}_thumb.jpg", content_hash);
        candidates.push((db.images_dir.join(thumb_filename), "image/jpeg"));
    }
    candidates.push((full_path, "image/png"));

    for (path, mime_type) in candidates {
        if path.exists() {
            let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
            return Ok(format!(
                "data:{};base64,{}",
                mime_type,
                BASE64.encode(bytes)
            ));
        }
    }

    Err("Image file not found".to_string())
}

#[tauri::command]
pub async fn save_clip_image_as(
    id: String,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<String, String> {
    let row: Option<(String, Vec<u8>)> =
        sqlx::query_as("SELECT clip_type, content FROM clips WHERE uuid = ?")
            .bind(&id)
            .fetch_optional(&db.pool)
            .await
            .map_err(|e| e.to_string())?;

    let Some((clip_type, content)) = row else {
        return Err("Clip not found".to_string());
    };
    if clip_type != "image" {
        return Err("Clip is not an image".to_string());
    }

    let filename = String::from_utf8_lossy(&content).into_owned();
    if !is_safe_image_filename(&filename) {
        return Err("Invalid image filename".to_string());
    }
    let source_path = db.images_dir.join(&filename);
    if !source_path.exists() {
        return Err("Image file not found".to_string());
    }

    #[cfg(target_os = "windows")]
    let save_path = {
        let default_name = filename.replace('\'', "''");
        let ps_script = format!(
            "Add-Type -AssemblyName System.Windows.Forms; \
             $f = New-Object System.Windows.Forms.SaveFileDialog; \
             $f.Filter = 'PNG Image (*.png)|*.png|All files (*.*)|*.*'; \
             $f.FileName = '{}'; \
             if ($f.ShowDialog() -eq 'OK') {{ $f.FileName }} else {{ '' }}",
            default_name
        );
        let output = tokio::task::spawn_blocking(move || {
            std::process::Command::new("powershell")
                .args(["-NoProfile", "-STA", "-Command", &ps_script])
                .output()
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path.is_empty() {
            return Err("Save cancelled".to_string());
        }
        path
    };
    #[cfg(target_os = "macos")]
    let save_path = {
        let output = tokio::task::spawn_blocking(move || {
            std::process::Command::new("osascript")
                .args([
                    "-e",
                    &format!(
                        r#"POSIX path of (choose file name with prompt "Save image" default name "{}")"#,
                        filename
                    ),
                ])
                .output()
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path.is_empty() {
            return Err("Save cancelled".to_string());
        }
        path
    };
    #[cfg(target_os = "linux")]
    let save_path = {
        let default_name = filename.clone();
        let output = tokio::task::spawn_blocking(move || {
            std::process::Command::new("zenity")
                .args([
                    "--file-selection",
                    "--save",
                    &format!("--filename={}", default_name),
                ])
                .output()
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path.is_empty() {
            return Err("Save cancelled".to_string());
        }
        path
    };

    if save_path.contains("..") || save_path.chars().any(|ch| ch.is_control()) {
        return Err("Invalid save path".to_string());
    }

    std::fs::copy(&source_path, &save_path).map_err(|e| format!("Failed to save image: {}", e))?;

    Ok(save_path)
}

fn is_safe_image_filename(filename: &str) -> bool {
    !filename.is_empty()
        && !filename.contains("..")
        && !filename.contains('\\')
        && !filename.contains('/')
}

async fn fetch_clip_for_clipboard(
    pool: &sqlx::SqlitePool,
    id: &str,
) -> Result<Option<Clip>, String> {
    sqlx::query_as(
        "SELECT id, uuid, clip_type, content, text_preview, content_hash,
                folder_id, is_deleted, source_app, '' as source_icon, metadata,
                created_at, last_accessed, last_pasted_at, is_pinned,
                subtype, note, paste_count, is_sensitive, updated_at
         FROM clips WHERE uuid = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())
}

fn batch_content_hash(clips: &[Clip]) -> String {
    let mut hasher = Sha256::new();
    for clip in clips {
        hasher.update(clip.content_hash.as_bytes());
        hasher.update([0]);
    }
    format!("{:x}", hasher.finalize())
}

fn image_paths_for_clips(
    clips: &[Clip],
    images_dir: &std::path::Path,
) -> Result<Vec<String>, String> {
    let mut paths = Vec::with_capacity(clips.len());
    for clip in clips {
        let filename = String::from_utf8_lossy(&clip.content).into_owned();
        if !is_safe_image_filename(&filename) {
            return Err("Invalid image filename".to_string());
        }
        let image_path = images_dir.join(&filename);
        if !image_path.exists() {
            return Err("Image file not found".to_string());
        }
        paths.push(image_path.to_string_lossy().to_string());
    }
    Ok(paths)
}

async fn mark_clips_pasted(pool: &sqlx::SqlitePool, uuids: &[String]) {
    if uuids.is_empty() {
        return;
    }

    let placeholders = uuids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "UPDATE clips SET created_at = CURRENT_TIMESTAMP, last_pasted_at = CURRENT_TIMESTAMP, paste_count = paste_count + 1, updated_at = CURRENT_TIMESTAMP WHERE uuid IN ({})",
        placeholders
    );
    let mut query = sqlx::query(&sql);
    for uuid in uuids {
        query = query.bind(uuid);
    }
    if let Err(e) = query.execute(pool).await {
        log::warn!("Failed to update batch paste metadata: {}", e);
    }

    let pasted_at = chrono::Utc::now().timestamp();
    let mut cache = crate::clipboard::SEARCH_CACHE.write();
    for uuid in uuids {
        if let Some(entry) = cache.get_mut(uuid) {
            entry.created_at = pasted_at;
        }
    }
}

#[tauri::command]
pub async fn paste_clip(
    id: String,
    app: AppHandle,
    window: tauri::WebviewWindow,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<(), String> {
    let pool = &db.pool;

    // Only fetch columns needed for paste (skip source_icon, metadata, etc.)
    let clip: Option<Clip> = sqlx::query_as(
        "SELECT id, uuid, clip_type, content, text_preview, content_hash,
                folder_id, is_deleted, source_app, '' as source_icon, metadata,
                created_at, last_accessed, last_pasted_at, is_pinned,
                subtype, note, paste_count, is_sensitive, updated_at
         FROM clips WHERE uuid = ?",
    )
    .bind(&id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    match clip {
        Some(clip) => {
            let content_hash = clip.content_hash.clone();
            let uuid = clip.uuid.clone();

            let final_res = if clip.clip_type == "image" {
                let filename = String::from_utf8_lossy(&clip.content).into_owned();
                let image_path = db.images_dir.join(&filename);
                let path_str = image_path.to_string_lossy().to_string();
                clipboard_write_image(&app, &path_str, &content_hash).await
            } else {
                let content_str = String::from_utf8_lossy(&clip.content).into_owned();
                clipboard_write_text(&app, &content_str, &content_hash).await
            };

            // Track paste + bump to top of list (created_at = now moves it to position 1)
            let pasted_at = chrono::Utc::now().timestamp();
            let _ = sqlx::query(r#"UPDATE clips SET created_at = CURRENT_TIMESTAMP, last_pasted_at = CURRENT_TIMESTAMP, paste_count = paste_count + 1, updated_at = CURRENT_TIMESTAMP WHERE uuid = ?"#)
                .bind(&uuid)
                .execute(pool)
                .await;
            if let Some(entry) = crate::clipboard::SEARCH_CACHE.write().get_mut(&uuid) {
                entry.created_at = pasted_at;
            }

            if final_res.is_ok() {
                let content = if clip.clip_type == "image" {
                    "[Image]".to_string()
                } else {
                    String::from_utf8_lossy(&clip.content).into_owned()
                };
                let _ = window.emit("clipboard-write", &content);
                check_auto_paste_and_hide(&window);
            }
            final_res
        }
        None => Err("Clip not found".to_string()),
    }
}

#[tauri::command]
pub async fn paste_clips(
    ids: Vec<String>,
    app: AppHandle,
    window: tauri::WebviewWindow,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }

    let pool = &db.pool;
    let mut clips = Vec::with_capacity(ids.len());
    for id in &ids {
        let Some(clip) = fetch_clip_for_clipboard(pool, id).await? else {
            return Err("Clip not found".to_string());
        };
        clips.push(clip);
    }

    let has_images = clips.iter().any(|clip| clip.clip_type == "image");
    let has_text = clips.iter().any(|clip| clip.clip_type != "image");
    if has_images && has_text {
        return Err("Select either text clips or image clips, not both".to_string());
    }

    let uuids = clips
        .iter()
        .map(|clip| clip.uuid.clone())
        .collect::<Vec<_>>();

    if has_images {
        let paths = image_paths_for_clips(&clips, &db.images_dir)?;
        let content_hash = if clips.len() == 1 {
            clips[0].content_hash.clone()
        } else {
            batch_content_hash(&clips)
        };

        if paths.len() == 1 {
            clipboard_write_image(&app, &paths[0], &content_hash).await?;
        } else {
            clipboard_write_files(&app, &paths, &content_hash).await?;
        }

        mark_clips_pasted(pool, &uuids).await;
        let content = if paths.len() == 1 {
            "[Image]"
        } else {
            "[Images]"
        };
        let _ = window.emit("clipboard-write", content);
    } else {
        let content = clips
            .iter()
            .map(|clip| String::from_utf8_lossy(&clip.content).into_owned())
            .collect::<Vec<_>>()
            .join("\n");
        let mut hasher = Sha256::new();
        hasher.update(content.as_bytes());
        let content_hash = format!("{:x}", hasher.finalize());

        clipboard_write_text(&app, &content, &content_hash).await?;
        mark_clips_pasted(pool, &uuids).await;
        let _ = window.emit("clipboard-write", &content);
    }

    check_auto_paste_and_hide(&window);
    Ok(())
}

#[tauri::command]
pub async fn copy_clip(
    id: String,
    app: AppHandle,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<(), String> {
    let pool = &db.pool;

    // Only fetch columns needed for copy (skip source_icon, metadata, etc.)
    let clip: Option<Clip> = sqlx::query_as(
        "SELECT id, uuid, clip_type, content, text_preview, content_hash,
                folder_id, is_deleted, source_app, '' as source_icon, metadata,
                created_at, last_accessed, last_pasted_at, is_pinned,
                subtype, note, paste_count, is_sensitive, updated_at
         FROM clips WHERE uuid = ?",
    )
    .bind(&id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    match clip {
        Some(clip) => {
            let content_hash = clip.content_hash.clone();

            if clip.clip_type == "image" {
                let filename = String::from_utf8_lossy(&clip.content).into_owned();
                let image_path = db.images_dir.join(&filename);
                let path_str = image_path.to_string_lossy().to_string();
                clipboard_write_image(&app, &path_str, &content_hash).await?;
            } else {
                let content_str = String::from_utf8_lossy(&clip.content).into_owned();
                clipboard_write_text(&app, &content_str, &content_hash).await?;
            }

            // Does NOT hide window or simulate paste
            Ok(())
        }
        None => Err("Clip not found".to_string()),
    }
}

#[tauri::command]
pub async fn paste_text(
    content: String,
    app: AppHandle,
    window: tauri::WebviewWindow,
    _db: tauri::State<'_, Arc<Database>>,
) -> Result<(), String> {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    let content_hash = format!("{:x}", hasher.finalize());

    clipboard_write_text(&app, &content, &content_hash).await?;

    let _ = window.emit("clipboard-write", &content);
    check_auto_paste_and_hide(&window);

    Ok(())
}

#[tauri::command]
pub async fn delete_clip(id: String, db: tauri::State<'_, Arc<Database>>) -> Result<(), String> {
    let pool = &db.pool;

    // Always clean up image file from disk when deleting
    let clip_info: Option<(String, Vec<u8>)> =
        sqlx::query_as("SELECT clip_type, content FROM clips WHERE uuid = ?")
            .bind(&id)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;

    if let Some((clip_type, content)) = &clip_info {
        if clip_type == "image" {
            let filename = String::from_utf8_lossy(content).into_owned();
            db.remove_image_and_thumb(&filename);
        }
    }

    sqlx::query("DELETE FROM clips WHERE uuid = ?")
        .bind(&id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    // Record tombstone for sync propagation
    crate::sync::record_tombstone(&db, &id, "clip").await.ok();

    // Remove from in-memory search cache
    crate::clipboard::remove_from_search_cache(&id);

    Ok(())
}

#[tauri::command]
pub async fn search_clips(
    query: String,
    filter_id: Option<String>,
    type_filter: Option<String>,
    limit: i64,
    offset: i64,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<Vec<ClipboardItem>, String> {
    let pool = &db.pool;

    let query_lower = query.to_lowercase();
    let folder_filter: Option<i64> = filter_id.as_deref().and_then(|id| id.parse::<i64>().ok());
    let type_filter = type_filter.filter(|value| !value.trim().is_empty());
    let limit = limit.max(0);
    let offset = offset.max(0);

    if type_filter.is_some() {
        if let Some(clips) = search_clips_fts(
            pool,
            &query_lower,
            folder_filter,
            type_filter.as_deref(),
            limit,
            offset,
        )
        .await?
        {
            let mut items = Vec::with_capacity(clips.len());
            for clip in &clips {
                items.push(clip_to_item_async(clip, &db.images_dir, false).await);
            }
            return Ok(items);
        }

        return search_clips_filtered_sql(
            pool,
            &db.images_dir,
            &query_lower,
            folder_filter,
            type_filter.as_deref(),
            limit,
            offset,
        )
        .await;
    }

    if let Some(clips) =
        search_clips_fts(pool, &query_lower, folder_filter, None, limit, offset).await?
    {
        if offset > 0 || clips.len() >= limit as usize {
            let mut items = Vec::with_capacity(clips.len());
            for clip in &clips {
                items.push(clip_to_item_async(clip, &db.images_dir, false).await);
            }
            return Ok(items);
        }

        let mut seen: std::collections::HashSet<String> =
            clips.iter().map(|clip| clip.uuid.clone()).collect();
        let mut fallback = search_clips_cache(
            pool,
            &db.images_dir,
            &query_lower,
            folder_filter,
            limit,
            offset,
        )
        .await?;
        fallback.retain(|item| seen.insert(item.id.clone()));

        let remaining = (limit as usize).saturating_sub(clips.len());
        let mut items = Vec::with_capacity(limit as usize);
        for clip in &clips {
            items.push(clip_to_item_async(clip, &db.images_dir, false).await);
        }
        items.extend(fallback.into_iter().take(remaining));
        return Ok(items);
    }

    search_clips_cache(
        pool,
        &db.images_dir,
        &query_lower,
        folder_filter,
        limit,
        offset,
    )
    .await
}

async fn search_clips_cache(
    pool: &sqlx::SqlitePool,
    images_dir: &std::path::Path,
    query_lower: &str,
    folder_filter: Option<i64>,
    limit: i64,
    offset: i64,
) -> Result<Vec<ClipboardItem>, String> {
    // Split query into words for multi-word matching — collect as &str slices to avoid allocations
    let query_words: Vec<&str> = query_lower.split_whitespace().collect();

    // Search clips, match against preview AND note
    // When a folder is selected, restrict results to that folder
    // Uses HashMap-based SEARCH_CACHE: uuid → search metadata
    // match_tier: 0=exact phrase, 1=all words substring, 2=note match, 3=fuzzy subsequence, 4=approx (typo-tolerant)
    let matched: Vec<SearchMatch> = {
        let cache = crate::clipboard::SEARCH_CACHE.read();
        cache
            .iter()
            .filter(|(_, entry)| match folder_filter {
                Some(target_fid) => entry.folder_id == Some(target_fid),
                None => true,
            })
            .filter_map(|(uuid, entry)| {
                // Tier 0: exact phrase match
                if entry.preview.contains(query_lower) {
                    return Some(SearchMatch::new(uuid, entry, 0, query_lower));
                }
                // Tier 1: all words present as substrings (AND match)
                if query_words.iter().all(|word| entry.preview.contains(word)) {
                    return Some(SearchMatch::new(uuid, entry, 1, query_lower));
                }
                // Tier 2: match in note
                if !entry.note.is_empty()
                    && query_words.iter().all(|word| entry.note.contains(word))
                {
                    return Some(SearchMatch::new(uuid, entry, 2, query_lower));
                }
                // Tier 3: fuzzy subsequence match (characters in order)
                if query_words
                    .iter()
                    .all(|word| fuzzy_contains(&entry.preview, word))
                {
                    return Some(SearchMatch::new(uuid, entry, 3, query_lower));
                }
                // Tier 4: approximate match (edit distance — tolerates typos)
                if query_words
                    .iter()
                    .all(|word| approx_word_match(&entry.preview, word))
                {
                    return Some(SearchMatch::new(uuid, entry, 4, query_lower));
                }
                None
            })
            .collect()
    };

    // Sort: relevance FIRST (exact > words > note > fuzzy), folder as tiebreaker
    let matched = paginate_search_matches(matched, folder_filter, limit, offset);

    let mut clips: Vec<Clip> = if matched.is_empty() {
        Vec::new()
    } else {
        let placeholders: String = matched.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT id, uuid, clip_type, X'' as content, text_preview, content_hash,
                    folder_id, is_deleted, source_app, source_icon, metadata,
                    created_at, last_accessed, last_pasted_at, is_pinned,
                    subtype, note, paste_count, is_sensitive, updated_at
             FROM clips WHERE uuid IN ({})",
            placeholders
        );
        let mut q = sqlx::query_as::<_, Clip>(&sql);
        for uuid in &matched {
            q = q.bind(uuid);
        }
        q.fetch_all(pool).await.map_err(|e| e.to_string())?
    };

    let result_order: std::collections::HashMap<&str, usize> = matched
        .iter()
        .enumerate()
        .map(|(idx, uuid)| (uuid.as_str(), idx))
        .collect();
    clips.sort_by_key(|clip| {
        result_order
            .get(clip.uuid.as_str())
            .copied()
            .unwrap_or(usize::MAX)
    });

    // Search results use text_preview instead of full content for speed.
    // Cards only display ~300 chars anyway. Full content loaded on paste.
    let mut items = Vec::with_capacity(clips.len());
    for clip in &clips {
        items.push(clip_to_item_async(clip, images_dir, false).await);
    }

    Ok(items)
}

async fn search_clips_filtered_sql(
    pool: &sqlx::SqlitePool,
    images_dir: &std::path::Path,
    query_lower: &str,
    folder_filter: Option<i64>,
    type_filter: Option<&str>,
    limit: i64,
    offset: i64,
) -> Result<Vec<ClipboardItem>, String> {
    let words: Vec<&str> = query_lower.split_whitespace().collect();
    let mut sql = String::from(
        "SELECT id, uuid, clip_type, X'' as content, text_preview, content_hash,
                folder_id, is_deleted, source_app, source_icon, metadata,
                created_at, last_accessed, last_pasted_at, is_pinned,
                subtype, note, paste_count, is_sensitive, updated_at
         FROM clips WHERE 1=1",
    );
    let subtype_bind = append_type_filter_sql(&mut sql, "", type_filter)?;
    if folder_filter.is_some() {
        sql.push_str(" AND folder_id = ?");
    }
    if !words.is_empty() {
        sql.push_str(" AND (");
        for (idx, _) in words.iter().enumerate() {
            if idx > 0 {
                sql.push_str(" AND ");
            }
            sql.push_str("(LOWER(text_preview) LIKE ? OR LOWER(COALESCE(note, '')) LIKE ?)");
        }
        sql.push(')');
    }
    sql.push_str(
        " ORDER BY
            CASE WHEN folder_id IS NOT NULL THEN 0 ELSE 1 END,
            is_pinned DESC,
            CASE WHEN note IS NOT NULL AND note != '' THEN 0 ELSE 1 END,
            CASE WHEN note IS NOT NULL AND note != '' THEN note ELSE NULL END,
            created_at DESC
          LIMIT ? OFFSET ?",
    );

    let mut query = sqlx::query_as::<_, Clip>(&sql);
    if let Some(subtype) = subtype_bind {
        query = query.bind(subtype);
    }
    if let Some(fid) = folder_filter {
        query = query.bind(fid);
    }
    for word in &words {
        let like = format!("%{}%", word);
        query = query.bind(like.clone()).bind(like);
    }
    let clips = query
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::with_capacity(clips.len());
    for clip in &clips {
        items.push(clip_to_item_async(clip, images_dir, false).await);
    }

    Ok(items)
}

async fn search_clips_fts(
    pool: &sqlx::SqlitePool,
    query_lower: &str,
    folder_filter: Option<i64>,
    type_filter: Option<&str>,
    limit: i64,
    offset: i64,
) -> Result<Option<Vec<Clip>>, String> {
    let Some(match_query) = build_fts_query(query_lower) else {
        return Ok(None);
    };

    let mut sql = String::from(
        "SELECT c.id, c.uuid, c.clip_type, X'' as content, c.text_preview, c.content_hash,
                c.folder_id, c.is_deleted, c.source_app, c.source_icon, c.metadata,
                c.created_at, c.last_accessed, c.last_pasted_at, c.is_pinned,
                c.subtype, c.note, c.paste_count, c.is_sensitive, c.updated_at
         FROM clips_fts f
         JOIN clips c ON c.id = f.rowid
         WHERE clips_fts MATCH ?",
    );
    let subtype_bind = append_type_filter_sql(&mut sql, "c.", type_filter)?;
    if folder_filter.is_some() {
        sql.push_str(" AND c.folder_id = ?");
    }
    // Coarse relevance bucket FIRST (mirrors the in-memory cache tiers): raw
    // bm25 is a near-unique float per row, so if it led the ORDER BY the
    // folder/pin/note keys after it would almost never break a tie. Bucket by
    // "starts with the query" / "contains the query" so equally-relevant
    // matches are then ordered by folder -> pin -> note, with bm25 as the
    // fine-grained tiebreak inside each bucket.
    sql.push_str(
        " ORDER BY
            CASE
              WHEN LOWER(c.text_preview) LIKE ? THEN 0
              WHEN LOWER(c.text_preview) LIKE ? THEN 1
              ELSE 2
            END,
            CASE WHEN c.folder_id IS NOT NULL THEN 0 ELSE 1 END,
            c.is_pinned DESC,
            CASE WHEN c.note IS NOT NULL AND c.note != '' THEN 0 ELSE 1 END,
            CASE WHEN c.note IS NOT NULL AND c.note != '' THEN c.note ELSE NULL END,
            bm25(clips_fts),
            c.created_at DESC
          LIMIT ? OFFSET ?",
    );

    let mut query = sqlx::query_as::<_, Clip>(&sql).bind(match_query);
    if let Some(subtype) = subtype_bind {
        query = query.bind(subtype);
    }
    if let Some(fid) = folder_filter {
        query = query.bind(fid);
    }
    query = query
        .bind(format!("{}%", query_lower))
        .bind(format!("%{}%", query_lower));
    query = query.bind(limit).bind(offset);

    match query.fetch_all(pool).await {
        Ok(clips) => Ok(Some(clips)),
        Err(e) => {
            log::debug!(
                "FTS search unavailable, falling back to cache search: {}",
                e
            );
            Ok(None)
        }
    }
}

fn append_type_filter_sql(
    sql: &mut String,
    prefix: &str,
    type_filter: Option<&str>,
) -> Result<Option<String>, String> {
    let Some(filter) = type_filter else {
        return Ok(None);
    };
    match filter {
        "text" => sql.push_str(&format!(
            " AND {prefix}clip_type = 'text' AND {prefix}subtype IS NULL"
        )),
        "image" => sql.push_str(&format!(" AND {prefix}clip_type = 'image'")),
        "html" => sql.push_str(&format!(" AND {prefix}clip_type = 'html'")),
        "rtf" => sql.push_str(&format!(" AND {prefix}clip_type = 'rtf'")),
        "url" | "email" | "color" | "path" | "phone" | "ip" | "json" | "code" => {
            sql.push_str(&format!(" AND {prefix}subtype = ?"));
            return Ok(Some(filter.to_string()));
        }
        _ => return Err("Invalid type filter".to_string()),
    }
    Ok(None)
}

fn build_fts_query(query: &str) -> Option<String> {
    let terms: Vec<String> = query
        .split_whitespace()
        .filter_map(|word| {
            let cleaned: String = word
                .chars()
                .filter(|ch| ch.is_alphanumeric() || *ch == '_')
                .collect();
            if cleaned.len() >= 2 {
                Some(format!("{cleaned}*"))
            } else {
                None
            }
        })
        .collect();

    if terms.is_empty() {
        None
    } else {
        Some(terms.join(" AND "))
    }
}

#[derive(Debug, Clone)]
struct SearchMatch {
    uuid: String,
    folder_id: Option<i64>,
    tier: u8,
    starts_with: bool,
    is_pinned: bool,
    note: String,
    created_at: i64,
}

impl SearchMatch {
    fn new(uuid: &str, entry: &crate::clipboard::SearchCacheEntry, tier: u8, query: &str) -> Self {
        Self {
            uuid: uuid.to_string(),
            folder_id: entry.folder_id,
            tier,
            starts_with: entry.preview.starts_with(query),
            is_pinned: entry.is_pinned,
            note: entry.note.clone(),
            created_at: entry.created_at,
        }
    }
}

fn search_folder_rank(fid: Option<i64>, folder_filter: Option<i64>) -> u8 {
    if let Some(target_fid) = folder_filter {
        if fid == Some(target_fid) {
            0
        } else if fid.is_some() {
            1
        } else {
            2
        }
    } else if fid.is_some() {
        0
    } else {
        1
    }
}

fn search_note_rank(note: &str) -> u8 {
    if note.is_empty() {
        1
    } else {
        0
    }
}

fn paginate_search_matches(
    mut matched: Vec<SearchMatch>,
    folder_filter: Option<i64>,
    limit: i64,
    offset: i64,
) -> Vec<String> {
    let limit = limit.max(0) as usize;
    if limit == 0 {
        return Vec::new();
    }

    matched.sort_by(|a, b| {
        a.tier
            .cmp(&b.tier)
            .then_with(|| b.starts_with.cmp(&a.starts_with))
            .then_with(|| {
                search_folder_rank(a.folder_id, folder_filter)
                    .cmp(&search_folder_rank(b.folder_id, folder_filter))
            })
            .then_with(|| b.is_pinned.cmp(&a.is_pinned))
            .then_with(|| search_note_rank(&a.note).cmp(&search_note_rank(&b.note)))
            .then_with(|| {
                if a.note.is_empty() || b.note.is_empty() {
                    std::cmp::Ordering::Equal
                } else {
                    a.note.cmp(&b.note)
                }
            })
            .then_with(|| b.created_at.cmp(&a.created_at))
            .then_with(|| a.uuid.cmp(&b.uuid))
    });

    matched
        .into_iter()
        .skip(offset.max(0) as usize)
        .take(limit)
        .map(|matched| matched.uuid)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{build_fts_query, paginate_search_matches, SearchMatch};

    fn search_match(uuid: &str, tier: u8, starts_with: bool, created_at: i64) -> SearchMatch {
        SearchMatch {
            uuid: uuid.to_string(),
            folder_id: None,
            tier,
            starts_with,
            is_pinned: false,
            note: String::new(),
            created_at,
        }
    }

    fn search_match_with_priority(
        uuid: &str,
        folder_id: Option<i64>,
        is_pinned: bool,
        note: &str,
        created_at: i64,
    ) -> SearchMatch {
        SearchMatch {
            uuid: uuid.to_string(),
            folder_id,
            tier: 0,
            starts_with: false,
            is_pinned,
            note: note.to_string(),
            created_at,
        }
    }

    #[test]
    fn paginate_search_matches_applies_offset_after_ranking() {
        let matched = vec![
            search_match("page-3", 0, false, 10),
            search_match("page-1", 0, false, 30),
            search_match("page-2", 0, false, 20),
        ];

        let first_page = paginate_search_matches(matched.clone(), None, 2, 0);
        let second_page = paginate_search_matches(matched, None, 2, 2);

        assert_eq!(first_page, vec!["page-1", "page-2"]);
        assert_eq!(second_page, vec!["page-3"]);
    }

    #[test]
    fn paginate_search_matches_uses_global_ranking_before_slicing() {
        let matched = vec![
            search_match("aaa-old", 0, false, 10),
            search_match("zzz-new", 0, false, 30),
            search_match("mmm-mid", 0, true, 20),
        ];

        assert_eq!(
            paginate_search_matches(matched.clone(), None, 2, 0),
            vec!["mmm-mid", "zzz-new"]
        );
        assert_eq!(
            paginate_search_matches(matched, None, 2, 2),
            vec!["aaa-old"]
        );
    }

    #[test]
    fn paginate_search_matches_prioritizes_folder_pin_and_note_tiebreakers() {
        let matched = vec![
            search_match_with_priority("plain-pinned-new", None, true, "", 50),
            search_match_with_priority("folder-plain-old", Some(1), false, "", 10),
            search_match_with_priority("folder-pinned-plain", Some(1), true, "", 20),
            search_match_with_priority("folder-pinned-zeta-note", Some(1), true, "zeta", 30),
            search_match_with_priority("folder-pinned-alpha-note", Some(1), true, "alpha", 40),
        ];

        assert_eq!(
            paginate_search_matches(matched, None, 5, 0),
            vec![
                "folder-pinned-alpha-note",
                "folder-pinned-zeta-note",
                "folder-pinned-plain",
                "folder-plain-old",
                "plain-pinned-new"
            ]
        );
    }

    #[test]
    fn build_fts_query_uses_prefix_terms_and_drops_punctuation() {
        assert_eq!(
            build_fts_query("hello world!"),
            Some("hello* AND world*".to_string())
        );
        assert_eq!(build_fts_query("! ?"), None);
    }
}

#[tauri::command]
pub async fn get_initial_state(
    _filter_id: Option<String>,
    limit: i64,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<serde_json::Value, String> {
    // Batch: fetch clips + folders + total count in parallel
    let pool = &db.pool;
    let images_dir = &db.images_dir;

    let clips_future = async {
        let result = sqlx::query_as::<_, Clip>(
            r#"
            SELECT id, uuid, clip_type,
                   CASE WHEN clip_type = 'image' THEN content ELSE X'' END as content,
                   text_preview, content_hash,
                   folder_id, is_deleted, source_app, source_icon, metadata,
                   created_at, last_accessed, last_pasted_at, is_pinned,
                   subtype, note, paste_count, is_sensitive, updated_at
            FROM clips
            ORDER BY created_at DESC LIMIT ? OFFSET 0
        "#,
        )
        .bind(limit)
        .fetch_all(pool)
        .await;
        let clips: Vec<Clip> = match result {
            Ok(c) => c,
            Err(e) => {
                log::error!("get_initial_state clips query failed: {}", e);
                Vec::new()
            }
        };

        let mut items = Vec::with_capacity(clips.len());
        for clip in &clips {
            items.push(clip_to_item_async(clip, images_dir, false).await);
        }
        items
    };

    let folders_future = async {
        let folders: Vec<crate::models::Folder> =
            sqlx::query_as(r#"SELECT * FROM folders ORDER BY position, id"#)
                .fetch_all(pool)
                .await
                .unwrap_or_default();
        let counts: Vec<(i64, i64)> = sqlx::query_as(r#"
            SELECT folder_id, COUNT(*) as count FROM clips WHERE folder_id IS NOT NULL GROUP BY folder_id
        "#).fetch_all(pool).await.unwrap_or_default();
        let count_map: std::collections::HashMap<i64, i64> = counts.into_iter().collect();
        folders
            .iter()
            .map(|f| {
                serde_json::json!({
                    "id": f.id.to_string(),
                    "name": f.name,
                    "icon": f.icon,
                    "color": f.color,
                    "is_system": f.is_system,
                    "item_count": count_map.get(&f.id).unwrap_or(&0),
                })
            })
            .collect::<Vec<_>>()
    };

    let total_future = async {
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM clips")
            .fetch_one(pool)
            .await
            .unwrap_or(0)
    };

    let (clips, folders, total) = tokio::join!(clips_future, folders_future, total_future);

    Ok(serde_json::json!({
        "clips": clips,
        "folders": folders,
        "total_count": total,
    }))
}

#[tauri::command]
pub async fn bulk_delete_clips(
    ids: Vec<String>,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<i64, String> {
    let pool = &db.pool;

    if ids.is_empty() {
        return Ok(0);
    }

    // Collect image filenames before deleting
    let placeholders: String = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT clip_type, content FROM clips WHERE uuid IN ({}) AND clip_type = 'image'",
        placeholders
    );
    let mut q = sqlx::query_as::<_, (String, Vec<u8>)>(&sql);
    for id in &ids {
        q = q.bind(id);
    }
    let image_clips: Vec<(String, Vec<u8>)> = q.fetch_all(pool).await.unwrap_or_default();

    // Delete all clips
    let del_sql = format!("DELETE FROM clips WHERE uuid IN ({})", placeholders);
    let mut dq = sqlx::query(&del_sql);
    for id in &ids {
        dq = dq.bind(id);
    }
    let result = dq.execute(pool).await.map_err(|e| e.to_string())?;

    // Clean up image files + thumbnails
    for (_, content) in &image_clips {
        let filename = String::from_utf8_lossy(content).into_owned();
        db.remove_image_and_thumb(&filename);
    }

    // Record tombstones + remove from search cache
    for id in &ids {
        crate::sync::record_tombstone(&db, id, "clip").await.ok();
        crate::clipboard::remove_from_search_cache(id);
    }

    Ok(result.rows_affected() as i64)
}

#[tauri::command]
pub async fn bulk_move_clips(
    ids: Vec<String>,
    folder_id: Option<String>,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<(), String> {
    let pool = &db.pool;

    if ids.is_empty() {
        return Ok(());
    }

    let folder_id_num = match folder_id {
        Some(id) => Some(id.parse::<i64>().map_err(|_| "Invalid folder ID")?),
        None => None,
    };

    let placeholders: String = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "UPDATE clips SET folder_id = ?, updated_at = CURRENT_TIMESTAMP WHERE uuid IN ({})",
        placeholders
    );
    let mut q = sqlx::query(&sql).bind(folder_id_num);
    for id in &ids {
        q = q.bind(id);
    }
    q.execute(pool).await.map_err(|e| e.to_string())?;

    // Update search cache (HashMap: uuid → (preview, folder_id, note))
    {
        let mut cache = crate::clipboard::SEARCH_CACHE.write();
        for id in &ids {
            if let Some(entry) = cache.get_mut(id) {
                entry.folder_id = folder_id_num;
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn bulk_set_pin(
    ids: Vec<String>,
    pinned: bool,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<i64, String> {
    let pool = &db.pool;

    if ids.is_empty() {
        return Ok(0);
    }

    let placeholders: String = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "UPDATE clips SET is_pinned = ?, updated_at = CURRENT_TIMESTAMP WHERE uuid IN ({})",
        placeholders
    );
    let mut q = sqlx::query(&sql).bind(pinned);
    for id in &ids {
        q = q.bind(id);
    }
    let result = q.execute(pool).await.map_err(|e| e.to_string())?;

    for id in &ids {
        crate::clipboard::update_pin_in_search_cache(id, pinned);
    }

    Ok(result.rows_affected() as i64)
}

#[tauri::command]
pub async fn toggle_pin(id: String, db: tauri::State<'_, Arc<Database>>) -> Result<bool, String> {
    let pool = &db.pool;
    sqlx::query("UPDATE clips SET is_pinned = CASE WHEN is_pinned = 0 THEN 1 ELSE 0 END, updated_at = CURRENT_TIMESTAMP WHERE uuid = ?")
        .bind(&id)
        .execute(pool).await.map_err(|e| e.to_string())?;

    let is_pinned: bool = sqlx::query_scalar("SELECT is_pinned FROM clips WHERE uuid = ?")
        .bind(&id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;

    crate::clipboard::update_pin_in_search_cache(&id, is_pinned);

    Ok(is_pinned)
}

#[tauri::command]
pub async fn update_note(
    id: String,
    note: Option<String>,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<(), String> {
    let pool = &db.pool;
    sqlx::query("UPDATE clips SET note = ?, updated_at = CURRENT_TIMESTAMP WHERE uuid = ?")
        .bind(&note)
        .bind(&id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    // Update search cache with new note
    crate::clipboard::update_note_in_search_cache(&id, note.as_deref());

    Ok(())
}

/// Re-scan all text clips and update is_sensitive flag based on current detection rules.
/// Delegates to Database::rescan_sensitive() which uses batched SQL updates.
#[tauri::command]
pub async fn rescan_sensitive(db: tauri::State<'_, Arc<Database>>) -> Result<u64, String> {
    let (updated, total) = db.rescan_sensitive().await;
    log::info!(
        "RESCAN (command): Updated is_sensitive on {} clips out of {}",
        updated,
        total
    );
    Ok(updated)
}

/// Re-scan all text clips and update subtype based on current detection rules.
/// Delegates to Database::rescan_subtypes() which uses batched SQL updates.
#[tauri::command]
pub async fn rescan_subtypes(db: tauri::State<'_, Arc<Database>>) -> Result<u64, String> {
    let (updated, total) = db.rescan_subtypes().await;
    log::info!(
        "RESCAN (command): Updated subtype on {} clips out of {}",
        updated,
        total
    );
    Ok(updated)
}
