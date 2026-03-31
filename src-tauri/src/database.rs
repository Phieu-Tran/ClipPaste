use sqlx::SqlitePool;

#[derive(Clone)]
pub struct Database {
    pub pool: SqlitePool,
}

impl Database {
    pub async fn new(db_path: &str) -> Self {
        let options = sqlx::sqlite::SqliteConnectOptions::new()
            .filename(db_path)
            .create_if_missing(true);

        let pool = SqlitePool::connect_with(options)
            .await
            .expect("Failed to connect to database");

        Self { pool }
    }

    pub async fn migrate(&self) -> Result<(), sqlx::Error> {
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                icon TEXT,
                color TEXT,
                is_system INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        "#).execute(&self.pool).await?;

        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS clips (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT NOT NULL UNIQUE,
                clip_type TEXT NOT NULL,
                content BLOB NOT NULL,
                text_preview TEXT,
                content_hash TEXT NOT NULL,
                folder_id INTEGER REFERENCES folders(id),
                is_deleted INTEGER DEFAULT 0,
                source_app TEXT,
                source_icon TEXT,
                metadata TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        "#).execute(&self.pool).await?;

        sqlx::query(r#"
            CREATE INDEX IF NOT EXISTS idx_clips_hash ON clips(content_hash);
        "#).execute(&self.pool).await?;

        sqlx::query(r#"
            CREATE INDEX IF NOT EXISTS idx_clips_folder ON clips(folder_id);
        "#).execute(&self.pool).await?;

        sqlx::query(r#"
            CREATE INDEX IF NOT EXISTS idx_clips_created ON clips(created_at);
        "#).execute(&self.pool).await?;

        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        "#).execute(&self.pool).await?;

        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS ignored_apps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                app_name TEXT NOT NULL UNIQUE
            )
        "#).execute(&self.pool).await?;

        // Add last_pasted_at column if it doesn't exist yet (safe to run multiple times)
        let _ = sqlx::query("ALTER TABLE clips ADD COLUMN last_pasted_at DATETIME DEFAULT NULL")
            .execute(&self.pool).await;

        // Add position column to folders if it doesn't exist yet (safe to run multiple times)
        let _ = sqlx::query("ALTER TABLE folders ADD COLUMN position INTEGER DEFAULT 0")
            .execute(&self.pool).await;

        // Add is_pinned column to clips if it doesn't exist yet (safe to run multiple times)
        let _ = sqlx::query("ALTER TABLE clips ADD COLUMN is_pinned INTEGER DEFAULT 0")
            .execute(&self.pool).await;

        // === FTS5 Full-Text Search ===
        // Create FTS5 virtual table for fast text search
        sqlx::query(r#"
            CREATE VIRTUAL TABLE IF NOT EXISTS clips_fts USING fts5(
                uuid UNINDEXED,
                text_content,
                content=''
            )
        "#).execute(&self.pool).await?;

        // Populate FTS5 from existing text clips (skip if already populated)
        let fts_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM clips_fts")
            .fetch_one(&self.pool).await.unwrap_or(0);
        let clip_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM clips WHERE clip_type != 'image' AND is_deleted = 0"
        ).fetch_one(&self.pool).await.unwrap_or(0);

        if fts_count == 0 && clip_count > 0 {
            log::info!("DB: Populating FTS5 index from {} existing text clips...", clip_count);
            sqlx::query(r#"
                INSERT INTO clips_fts(uuid, text_content)
                SELECT uuid, CAST(content AS TEXT) FROM clips
                WHERE clip_type != 'image' AND is_deleted = 0
            "#).execute(&self.pool).await?;
            log::info!("DB: FTS5 index populated.");
        }

        // Rebuild text_preview for existing clips that have short previews (< 500 chars)
        // This upgrades old 200-char previews to 2000-char previews
        let upgraded: u64 = sqlx::query(r#"
            UPDATE clips SET text_preview = SUBSTR(CAST(content AS TEXT), 1, 2000)
            WHERE clip_type != 'image' AND LENGTH(text_preview) < 500
            AND LENGTH(CAST(content AS TEXT)) > LENGTH(text_preview)
        "#).execute(&self.pool).await.map(|r| r.rows_affected()).unwrap_or(0);
        if upgraded > 0 {
            log::info!("DB: Upgraded text_preview for {} clips (200 → 2000 chars)", upgraded);
        }

       Ok(())
    }

    pub async fn add_ignored_app(&self, app_name: &str) -> Result<(), sqlx::Error> {
        sqlx::query("INSERT OR IGNORE INTO ignored_apps (app_name) VALUES (?)")
            .bind(app_name)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn remove_ignored_app(&self, app_name: &str) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM ignored_apps WHERE app_name = ?")
            .bind(app_name)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn get_ignored_apps(&self) -> Result<Vec<String>, sqlx::Error> {
        let apps = sqlx::query_scalar::<_, String>("SELECT app_name FROM ignored_apps ORDER BY app_name")
            .fetch_all(&self.pool)
            .await?;
        log::info!("DB: Ignored apps: {:?}", apps);
        Ok(apps)
    }

    pub async fn is_app_ignored(&self, app_name: &str) -> Result<bool, sqlx::Error> {
        // Case-insensitive check might be better for Windows exe names
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ignored_apps WHERE LOWER(app_name) = LOWER(?)")
            .bind(app_name)
            .fetch_one(&self.pool)
            .await?;
        Ok(count > 0)
    }

    pub async fn get_setting(&self, key: &str) -> Result<Option<String>, sqlx::Error> {
        let value = sqlx::query_scalar(r#"
            SELECT value FROM settings WHERE key = ?
        "#)
        .bind(key)
        .fetch_optional(&self.pool)
        .await?;

        Ok(value)
    }
}