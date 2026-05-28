//! CLI automation hooks — run ClipPaste commands from terminal.
//!
//! Usage:
//!   clippaste --list [N]           List last N clips (default 10)
//!   clippaste --search "query"     Search clips
//!   clippaste --get <id>           Get full content of a clip by ID
//!   clippaste --stats              Show dashboard stats
//!   clippaste --bench [query]      Run read-only performance checks
//!   clippaste --count              Show total clip count
//!   clippaste --clear              Clear clipboard history (keeps folder items)
//!   clippaste --help-cli           Show CLI help
//!
//! If no CLI flags are passed, the app starts normally with GUI.

use crate::database::Database;
use crate::utils;
use std::future::Future;
use std::path::Path;
use std::time::Instant;

type ListRow = (
    i64,
    String,
    String,
    String,
    Option<String>,
    Option<String>,
    bool,
);

/// Check if any CLI args are present. Returns true if CLI was handled (app should exit).
pub fn handle_cli() -> bool {
    let args: Vec<String> = std::env::args().collect();

    if args.len() < 2 {
        return false;
    }

    let cmd = args[1].as_str();
    match cmd {
        "--list" | "--search" | "--get" | "--stats" | "--bench" | "--count" | "--clear"
        | "--help-cli" => {}
        _ => return false,
    }

    if cmd == "--help-cli" {
        print_help();
        return true;
    }

    // Build tokio runtime + DB connection for CLI commands
    let rt = tokio::runtime::Runtime::new().expect("Failed to create runtime");
    rt.block_on(async {
        let data_dir = get_data_dir();
        let db_path = data_dir.join("clipboard.db");

        if !db_path.exists() {
            eprintln!("Error: database not found at {:?}", db_path);
            eprintln!("Run ClipPaste GUI at least once to create the database.");
            std::process::exit(1);
        }

        let db = Database::new(db_path.to_str().unwrap_or("clipboard.db"), &data_dir).await;

        match cmd {
            "--list" => {
                let limit: i64 = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(10);
                cmd_list(&db, limit).await;
            }
            "--search" => {
                let query = args.get(2).map(|s| s.as_str()).unwrap_or("");
                if query.is_empty() {
                    eprintln!("Usage: clippaste --search \"query\"");
                    std::process::exit(1);
                }
                cmd_search(&db, query).await;
            }
            "--get" => {
                let id = args.get(2).map(|s| s.as_str()).unwrap_or("");
                if id.is_empty() {
                    eprintln!("Usage: clippaste --get <id>");
                    std::process::exit(1);
                }
                cmd_get(&db, id).await;
            }
            "--stats" => {
                cmd_stats(&db).await;
            }
            "--bench" => {
                let query = args.get(2).map(|s| s.as_str()).unwrap_or("http");
                cmd_bench(&db, &data_dir, &db_path, query).await;
            }
            "--count" => {
                cmd_count(&db).await;
            }
            "--clear" => {
                cmd_clear(&db).await;
            }
            _ => {}
        }

        db.pool.close().await;
    });

    true
}

fn print_help() {
    println!("ClipPaste CLI");
    println!();
    println!("USAGE:");
    println!("  clippaste --list [N]           List last N clips (default 10)");
    println!("  clippaste --search \"query\"      Search clips by text");
    println!("  clippaste --get <id>           Get full content of a clip");
    println!("  clippaste --stats              Show clipboard statistics");
    println!("  clippaste --bench [query]      Run read-only DB/image performance checks");
    println!("  clippaste --count              Show total clip count");
    println!("  clippaste --clear              Clear history (keeps folder items)");
    println!("  clippaste --help-cli           Show this help");
    println!();
    println!("Without flags, ClipPaste starts the GUI normally.");
}

fn get_data_dir() -> std::path::PathBuf {
    // Check custom data directory from config
    let config_path = utils::get_config_path();
    if let Ok(content) = std::fs::read_to_string(&config_path) {
        if let Ok(config) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(dir) = config.get("data_directory").and_then(|v| v.as_str()) {
                let p = std::path::PathBuf::from(dir);
                if p.exists() {
                    return p;
                }
            }
        }
    }
    utils::get_default_data_dir()
}

async fn cmd_list(db: &Database, limit: i64) {
    let rows: Vec<ListRow> = sqlx::query_as(
        "SELECT id, clip_type, text_preview, created_at, source_app, note, is_pinned
         FROM clips ORDER BY created_at DESC LIMIT ?",
    )
    .bind(limit)
    .fetch_all(&db.pool)
    .await
    .unwrap_or_default();

    if rows.is_empty() {
        println!("No clips found.");
        return;
    }

    for (id, clip_type, preview, _created_at, source_app, note, is_pinned) in &rows {
        let pin = if *is_pinned { " [pinned]" } else { "" };
        let app = source_app.as_deref().unwrap_or("unknown");
        let text = preview.replace('\n', " ").replace('\r', "");
        let truncated = if text.len() > 80 {
            format!("{}...", &text[..77])
        } else {
            text
        };
        println!(
            "#{:<5} {:>5}  {:<15} {}{}",
            id, clip_type, app, truncated, pin
        );
        if let Some(n) = note {
            if !n.is_empty() {
                println!("       note: {}", n);
            }
        }
    }
}

async fn cmd_search(db: &Database, query: &str) {
    let pattern = format!("%{}%", query);
    let rows: Vec<(i64, String, String, String, Option<String>)> = sqlx::query_as(
        "SELECT id, clip_type, text_preview, created_at, source_app
         FROM clips WHERE text_preview LIKE ? ORDER BY created_at DESC LIMIT 20",
    )
    .bind(&pattern)
    .fetch_all(&db.pool)
    .await
    .unwrap_or_default();

    if rows.is_empty() {
        println!("No clips matching \"{}\".", query);
        return;
    }

    println!("Found {} result(s) for \"{}\":", rows.len(), query);
    for (id, clip_type, preview, _created_at, source_app) in &rows {
        let app = source_app.as_deref().unwrap_or("unknown");
        let text = preview.replace('\n', " ").replace('\r', "");
        let truncated = if text.len() > 80 {
            format!("{}...", &text[..77])
        } else {
            text
        };
        println!("#{:<5} {:>5}  {:<15} {}", id, clip_type, app, truncated);
    }
}

async fn cmd_get(db: &Database, id_str: &str) {
    let id: i64 = match id_str.parse() {
        Ok(v) => v,
        Err(_) => {
            eprintln!("Error: invalid ID \"{}\"", id_str);
            std::process::exit(1);
        }
    };

    let row: Option<(String, Vec<u8>, String)> =
        sqlx::query_as("SELECT clip_type, content, text_preview FROM clips WHERE id = ?")
            .bind(id)
            .fetch_optional(&db.pool)
            .await
            .unwrap_or(None);

    match row {
        Some((clip_type, content, _preview)) => {
            if clip_type == "image" {
                let filename = String::from_utf8_lossy(&content);
                println!("[Image file: {}]", filename);
            } else {
                let text = String::from_utf8_lossy(&content);
                print!("{}", text);
            }
        }
        None => {
            eprintln!("Clip #{} not found.", id);
            std::process::exit(1);
        }
    }
}

async fn cmd_stats(db: &Database) {
    let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM clips")
        .fetch_one(&db.pool)
        .await
        .unwrap_or((0,));
    let images: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM clips WHERE clip_type = 'image'")
        .fetch_one(&db.pool)
        .await
        .unwrap_or((0,));
    let folders: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM folders")
        .fetch_one(&db.pool)
        .await
        .unwrap_or((0,));
    let pinned: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM clips WHERE is_pinned = 1")
        .fetch_one(&db.pool)
        .await
        .unwrap_or((0,));
    let sensitive: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM clips WHERE is_sensitive = 1")
        .fetch_one(&db.pool)
        .await
        .unwrap_or((0,));
    let in_folders: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM clips WHERE folder_id IS NOT NULL")
            .fetch_one(&db.pool)
            .await
            .unwrap_or((0,));

    println!("ClipPaste Statistics");
    println!("  Total clips:     {}", total.0);
    println!("  Images:          {}", images.0);
    println!("  In folders:      {}", in_folders.0);
    println!("  Pinned:          {}", pinned.0);
    println!("  Sensitive:       {}", sensitive.0);
    println!("  Folders:         {}", folders.0);
}

async fn cmd_count(db: &Database) {
    let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM clips")
        .fetch_one(&db.pool)
        .await
        .unwrap_or((0,));
    println!("{}", count);
}

async fn measure_async<T, F>(operation: F) -> (T, u128)
where
    F: Future<Output = T>,
{
    let started = Instant::now();
    let value = operation.await;
    (value, started.elapsed().as_millis())
}

fn measure_sync<T>(operation: impl FnOnce() -> T) -> (T, u128) {
    let started = Instant::now();
    let value = operation();
    (value, started.elapsed().as_millis())
}

fn format_bytes(bytes: u64) -> String {
    const KB: f64 = 1024.0;
    const MB: f64 = 1024.0 * KB;
    const GB: f64 = 1024.0 * MB;

    let value = bytes as f64;
    if value >= GB {
        format!("{:.2} GiB", value / GB)
    } else if value >= MB {
        format!("{:.2} MiB", value / MB)
    } else if value >= KB {
        format!("{:.2} KiB", value / KB)
    } else {
        format!("{} B", bytes)
    }
}

fn scan_directory_size(path: &Path) -> (u64, u64) {
    let mut files = 0u64;
    let mut bytes = 0u64;
    let mut stack = vec![path.to_path_buf()];

    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };

        for entry in entries.flatten() {
            let Ok(metadata) = entry.metadata() else {
                continue;
            };
            if metadata.is_dir() {
                stack.push(entry.path());
            } else if metadata.is_file() {
                files += 1;
                bytes += metadata.len();
            }
        }
    }

    (files, bytes)
}

async fn cmd_bench(db: &Database, data_dir: &Path, db_path: &Path, search_query: &str) {
    println!("ClipPaste Read-only Benchmark");
    println!("  Data dir: {}", data_dir.display());
    println!("  DB path:  {}", db_path.display());

    let db_size = std::fs::metadata(db_path).map(|m| m.len()).unwrap_or(0);
    println!("  DB size:  {} ({})", format_bytes(db_size), db_size);

    let images_dir = data_dir.join("images");
    let ((image_files, image_bytes), image_scan_ms) =
        measure_sync(|| scan_directory_size(&images_dir));
    println!(
        "  Images:   {} files, {} ({}) scanned in {}ms",
        image_files,
        format_bytes(image_bytes),
        image_bytes,
        image_scan_ms
    );
    println!();

    let ((total, images, folders, pinned, sensitive, in_folders), stats_ms) =
        measure_async(async {
            sqlx::query_as::<_, (i64, i64, i64, i64, i64, i64)>(
                "SELECT
                (SELECT COUNT(*) FROM clips),
                (SELECT COUNT(*) FROM clips WHERE clip_type = 'image'),
                (SELECT COUNT(*) FROM folders),
                (SELECT COUNT(*) FROM clips WHERE is_pinned = 1),
                (SELECT COUNT(*) FROM clips WHERE is_sensitive = 1),
                (SELECT COUNT(*) FROM clips WHERE folder_id IS NOT NULL)",
            )
            .fetch_one(&db.pool)
            .await
            .unwrap_or((0, 0, 0, 0, 0, 0))
        })
        .await;

    println!("Counts in {}ms", stats_ms);
    println!("  Total clips: {}", total);
    println!("  Images:      {}", images);
    println!("  Folders:     {}", folders);
    println!("  In folders:  {}", in_folders);
    println!("  Pinned:      {}", pinned);
    println!("  Sensitive:   {}", sensitive);
    println!();

    let (latest_rows, latest_ms) = measure_async(async {
        sqlx::query_as::<_, (i64, String, String)>(
            "SELECT id, clip_type, text_preview
             FROM clips
             ORDER BY created_at DESC
             LIMIT 20",
        )
        .fetch_all(&db.pool)
        .await
        .map(|rows| rows.len())
        .unwrap_or(0)
    })
    .await;

    let pattern = format!("%{}%", search_query);
    let (search_rows, search_ms) = measure_async(async {
        sqlx::query_as::<_, (i64, String)>(
            "SELECT id, text_preview
             FROM clips
             WHERE text_preview LIKE ?
             ORDER BY created_at DESC
             LIMIT 20",
        )
        .bind(&pattern)
        .fetch_all(&db.pool)
        .await
        .map(|rows| rows.len())
        .unwrap_or(0)
    })
    .await;

    let (cache_rows, cache_ms) = measure_async(async {
        sqlx::query_as::<_, (String, String, Option<i64>, Option<String>)>(
            "SELECT uuid, COALESCE(text_preview, ''), folder_id, note
             FROM clips
             ORDER BY created_at DESC
             LIMIT 50000",
        )
        .fetch_all(&db.pool)
        .await
        .map(|rows| rows.len())
        .unwrap_or(0)
    })
    .await;

    println!("Query timings");
    println!(
        "  latest 20 clips:       {}ms ({} rows)",
        latest_ms, latest_rows
    );
    println!(
        "  search \"{}\":         {}ms ({} rows)",
        search_query, search_ms, search_rows
    );
    println!(
        "  startup cache query:   {}ms ({} rows)",
        cache_ms, cache_rows
    );
}

async fn cmd_clear(db: &Database) {
    let result = sqlx::query("DELETE FROM clips WHERE folder_id IS NULL")
        .execute(&db.pool)
        .await;
    match result {
        Ok(r) => println!(
            "Cleared {} clips (folder items preserved).",
            r.rows_affected()
        ),
        Err(e) => {
            eprintln!("Error: {}", e);
            std::process::exit(1);
        }
    }
}
