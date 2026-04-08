use std::fmt;

#[derive(Debug)]
pub enum SyncError {
    /// Network / HTTP errors
    Network(String),
    /// Google Drive API errors (status code + message)
    DriveApi(u16, String),
    /// OAuth2 flow errors
    Auth(String),
    /// Encryption / decryption errors
    Encryption(String),
    /// Database errors
    Database(String),
    /// Serialization errors
    Serialization(String),
    /// File I/O errors
    Io(String),
    /// Sync not configured (no account connected)
    NotConfigured,
    /// Another sync is already in progress
    AlreadyRunning,
}

impl fmt::Display for SyncError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SyncError::Network(msg) => write!(f, "Network error: {}", msg),
            SyncError::DriveApi(code, msg) => write!(f, "Drive API error ({}): {}", code, msg),
            SyncError::Auth(msg) => write!(f, "Auth error: {}", msg),
            SyncError::Encryption(msg) => write!(f, "Encryption error: {}", msg),
            SyncError::Database(msg) => write!(f, "Database error: {}", msg),
            SyncError::Serialization(msg) => write!(f, "Serialization error: {}", msg),
            SyncError::Io(msg) => write!(f, "I/O error: {}", msg),
            SyncError::NotConfigured => write!(f, "Sync not configured"),
            SyncError::AlreadyRunning => write!(f, "Sync already in progress"),
        }
    }
}

impl std::error::Error for SyncError {}

impl From<sqlx::Error> for SyncError {
    fn from(e: sqlx::Error) -> Self {
        SyncError::Database(e.to_string())
    }
}

impl From<serde_json::Error> for SyncError {
    fn from(e: serde_json::Error) -> Self {
        SyncError::Serialization(e.to_string())
    }
}

impl From<std::io::Error> for SyncError {
    fn from(e: std::io::Error) -> Self {
        SyncError::Io(e.to_string())
    }
}
