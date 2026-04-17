use super::error::SyncError;
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::time::Duration;

const DRIVE_FILES_URL: &str = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL: &str = "https://www.googleapis.com/upload/drive/v3/files";

/// Maximum number of retries for 429/503 responses.
const MAX_RETRIES: u32 = 3;
/// Base delay in milliseconds for exponential backoff.
const BASE_DELAY_MS: u64 = 1000;

#[derive(Debug, Deserialize)]
struct FileList {
    files: Vec<DriveFile>,
    #[serde(rename = "nextPageToken")]
    next_page_token: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DriveFile {
    pub id: String,
    pub name: String,
    #[serde(rename = "modifiedTime")]
    pub modified_time: Option<String>,
    #[serde(rename = "mimeType")]
    pub mime_type: Option<String>,
    pub size: Option<String>,
}

/// Google Drive API client using appDataFolder.
pub struct DriveClient {
    client: reqwest::Client,
    access_token: String,
}

/// Check if an HTTP response status is retryable (429 or 503).
fn is_retryable_status(status: u16) -> bool {
    status == 429 || status == 503
}

/// Compute the backoff delay for a given attempt, respecting Retry-After header if present.
fn compute_backoff_delay(attempt: u32, retry_after_secs: Option<u64>) -> Duration {
    let base = match retry_after_secs {
        Some(secs) => Duration::from_secs(secs),
        None => Duration::from_millis(BASE_DELAY_MS * 2u64.pow(attempt)),
    };

    // Add jitter: +/- 25%
    let base_ms = base.as_millis() as u64;
    let jitter_range = (base_ms / 4).max(1);
    let jitter = rand::thread_rng().gen_range(0..=jitter_range * 2) as i64 - jitter_range as i64;
    let final_ms = (base_ms as i64 + jitter).max(100) as u64;

    Duration::from_millis(final_ms)
}

/// Parse the Retry-After header value as seconds.
fn parse_retry_after(resp: &reqwest::Response) -> Option<u64> {
    resp.headers()
        .get("Retry-After")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<u64>().ok())
}

impl DriveClient {
    pub fn new(access_token: &str) -> Self {
        Self {
            client: reqwest::Client::new(),
            access_token: access_token.to_string(),
        }
    }

    /// Handle a network-level (reqwest::Error) failure during send().
    /// If retries remain, sleeps for backoff and returns Ok(()). Caller must `continue`.
    /// If retries exhausted, returns Err(Network).
    async fn backoff_network_error(
        err: reqwest::Error,
        attempt: u32,
        context: &str,
    ) -> Result<(), SyncError> {
        if attempt >= MAX_RETRIES {
            return Err(SyncError::Network(err.to_string()));
        }
        let delay = compute_backoff_delay(attempt, None);
        log::warn!(
            "SYNC: Network error during {}: {}, retrying in {:?} (attempt {}/{})",
            context, err, delay, attempt + 1, MAX_RETRIES
        );
        tokio::time::sleep(delay).await;
        Ok(())
    }

    /// Check a response for retryable status codes (429/503).
    /// If retryable and retries remain, sleeps for the backoff duration and returns Ok(None).
    /// If retryable and retries exhausted, returns Err(RateLimited).
    /// If not retryable, returns Ok(Some(response)) to be processed by the caller.
    async fn check_retry(
        resp: reqwest::Response,
        attempt: u32,
        context: &str,
    ) -> Result<Option<reqwest::Response>, SyncError> {
        let status = resp.status().as_u16();
        if !is_retryable_status(status) {
            return Ok(Some(resp));
        }

        let retry_after = parse_retry_after(&resp);

        if attempt >= MAX_RETRIES {
            let body = resp.text().await.unwrap_or_default();
            return Err(SyncError::RateLimited(format!(
                "{}: HTTP {} after {} retries: {}",
                context, status, MAX_RETRIES, body
            )));
        }

        let delay = compute_backoff_delay(attempt, retry_after);
        log::warn!(
            "SYNC: Rate limited ({}) during {}, retrying in {:?} (attempt {}/{})",
            status,
            context,
            delay,
            attempt + 1,
            MAX_RETRIES
        );
        tokio::time::sleep(delay).await;

        Ok(None) // Signal: retry needed
    }

    /// List files in appDataFolder, optionally filtering by name or modified time.
    pub async fn list_files(
        &self,
        name_contains: Option<&str>,
        modified_after: Option<&str>,
    ) -> Result<Vec<DriveFile>, SyncError> {
        let mut all_files = Vec::new();
        let mut page_token: Option<String> = None;

        loop {
            let mut query_parts = vec!["'appDataFolder' in parents".to_string()];
            if let Some(name) = name_contains {
                query_parts.push(format!("name contains '{}'", name.replace('\'', "\\'")));
            }
            if let Some(after) = modified_after {
                query_parts.push(format!("modifiedTime > '{}'", after));
            }
            let q = query_parts.join(" and ");

            let file_list: FileList = 'retry: {
                for attempt in 0..=MAX_RETRIES {
                    let mut req = self
                        .client
                        .get(DRIVE_FILES_URL)
                        .bearer_auth(&self.access_token)
                        .query(&[
                            ("spaces", "appDataFolder"),
                            ("q", &q),
                            (
                                "fields",
                                "files(id,name,modifiedTime,mimeType,size),nextPageToken",
                            ),
                            ("pageSize", "1000"),
                        ]);

                    if let Some(ref token) = page_token {
                        req = req.query(&[("pageToken", token.as_str())]);
                    }

                    let resp = match req.send().await {
                        Ok(r) => r,
                        Err(e) => { Self::backoff_network_error(e, attempt, "list_files").await?; continue; }
                    };

                    match Self::check_retry(resp, attempt, "list_files").await? {
                        Some(resp) => {
                            let status = resp.status();
                            if !status.is_success() {
                                let body = resp.text().await.unwrap_or_default();
                                return Err(SyncError::DriveApi(status.as_u16(), body));
                            }
                            break 'retry resp
                                .json()
                                .await
                                .map_err(|e| SyncError::Serialization(e.to_string()))?;
                        }
                        None => continue, // retry
                    }
                }
                unreachable!()
            };

            all_files.extend(file_list.files);

            match file_list.next_page_token {
                Some(token) => page_token = Some(token),
                None => break,
            }
        }

        Ok(all_files)
    }

    /// Get a file by exact name in appDataFolder.
    pub async fn find_file_by_name(&self, name: &str) -> Result<Option<DriveFile>, SyncError> {
        let q = format!(
            "'appDataFolder' in parents and name = '{}'",
            name.replace('\'', "\\'")
        );

        for attempt in 0..=MAX_RETRIES {
            let resp = match self
                .client
                .get(DRIVE_FILES_URL)
                .bearer_auth(&self.access_token)
                .query(&[
                    ("spaces", "appDataFolder"),
                    ("q", &q),
                    ("fields", "files(id,name,modifiedTime,mimeType,size)"),
                    ("pageSize", "1"),
                ])
                .send()
                .await
            {
                Ok(r) => r,
                Err(e) => { Self::backoff_network_error(e, attempt, "find_file_by_name").await?; continue; }
            };

            match Self::check_retry(resp, attempt, "find_file_by_name").await? {
                Some(resp) => {
                    let status = resp.status();
                    if !status.is_success() {
                        let body = resp.text().await.unwrap_or_default();
                        return Err(SyncError::DriveApi(status.as_u16(), body));
                    }
                    let file_list: FileList = resp
                        .json()
                        .await
                        .map_err(|e| SyncError::Serialization(e.to_string()))?;
                    return Ok(file_list.files.into_iter().next());
                }
                None => continue,
            }
        }
        unreachable!()
    }

    /// Create a new file in appDataFolder.
    pub async fn create_file(
        &self,
        name: &str,
        content: &[u8],
        mime_type: &str,
    ) -> Result<DriveFile, SyncError> {
        let metadata = serde_json::json!({
            "name": name,
            "parents": ["appDataFolder"],
        });

        let boundary = "clippaste_boundary_xyz";

        for attempt in 0..=MAX_RETRIES {
            let body = build_multipart_body(boundary, &metadata, content, mime_type);

            let resp = match self
                .client
                .post(DRIVE_UPLOAD_URL)
                .bearer_auth(&self.access_token)
                .query(&[
                    ("uploadType", "multipart"),
                    ("fields", "id,name,modifiedTime,mimeType,size"),
                ])
                .header(
                    "Content-Type",
                    format!("multipart/related; boundary={}", boundary),
                )
                .body(body)
                .send()
                .await
            {
                Ok(r) => r,
                Err(e) => { Self::backoff_network_error(e, attempt, "create_file").await?; continue; }
            };

            match Self::check_retry(resp, attempt, "create_file").await? {
                Some(resp) => {
                    let status = resp.status();
                    if !status.is_success() {
                        let body = resp.text().await.unwrap_or_default();
                        return Err(SyncError::DriveApi(status.as_u16(), body));
                    }
                    return resp
                        .json()
                        .await
                        .map_err(|e| SyncError::Serialization(e.to_string()));
                }
                None => continue,
            }
        }
        unreachable!()
    }

    /// Update an existing file's content.
    pub async fn update_file(
        &self,
        file_id: &str,
        content: &[u8],
        mime_type: &str,
    ) -> Result<DriveFile, SyncError> {
        let url = format!("{}/{}", DRIVE_UPLOAD_URL, file_id);

        for attempt in 0..=MAX_RETRIES {
            let resp = match self
                .client
                .patch(&url)
                .bearer_auth(&self.access_token)
                .query(&[
                    ("uploadType", "media"),
                    ("fields", "id,name,modifiedTime,mimeType,size"),
                ])
                .header("Content-Type", mime_type)
                .body(content.to_vec())
                .send()
                .await
            {
                Ok(r) => r,
                Err(e) => { Self::backoff_network_error(e, attempt, "update_file").await?; continue; }
            };

            match Self::check_retry(resp, attempt, "update_file").await? {
                Some(resp) => {
                    let status = resp.status();
                    if !status.is_success() {
                        let body = resp.text().await.unwrap_or_default();
                        return Err(SyncError::DriveApi(status.as_u16(), body));
                    }
                    return resp
                        .json()
                        .await
                        .map_err(|e| SyncError::Serialization(e.to_string()));
                }
                None => continue,
            }
        }
        unreachable!()
    }

    /// Download a file's content by file ID.
    pub async fn download_file(&self, file_id: &str) -> Result<Vec<u8>, SyncError> {
        let url = format!("{}/{}?alt=media", DRIVE_FILES_URL, file_id);

        for attempt in 0..=MAX_RETRIES {
            let resp = match self
                .client
                .get(&url)
                .bearer_auth(&self.access_token)
                .send()
                .await
            {
                Ok(r) => r,
                Err(e) => { Self::backoff_network_error(e, attempt, "download_file").await?; continue; }
            };

            match Self::check_retry(resp, attempt, "download_file").await? {
                Some(resp) => {
                    let status = resp.status();
                    if !status.is_success() {
                        let body = resp.text().await.unwrap_or_default();
                        return Err(SyncError::DriveApi(status.as_u16(), body));
                    }
                    return resp
                        .bytes()
                        .await
                        .map(|b| b.to_vec())
                        .map_err(|e| SyncError::Network(e.to_string()));
                }
                None => continue,
            }
        }
        unreachable!()
    }

    /// Delete a file by ID.
    pub async fn delete_file(&self, file_id: &str) -> Result<(), SyncError> {
        let url = format!("{}/{}", DRIVE_FILES_URL, file_id);

        for attempt in 0..=MAX_RETRIES {
            let resp = match self
                .client
                .delete(&url)
                .bearer_auth(&self.access_token)
                .send()
                .await
            {
                Ok(r) => r,
                Err(e) => { Self::backoff_network_error(e, attempt, "delete_file").await?; continue; }
            };

            match Self::check_retry(resp, attempt, "delete_file").await? {
                Some(resp) => {
                    let status = resp.status();
                    if !status.is_success() && status.as_u16() != 404 {
                        let body = resp.text().await.unwrap_or_default();
                        return Err(SyncError::DriveApi(status.as_u16(), body));
                    }
                    return Ok(());
                }
                None => continue,
            }
        }
        unreachable!()
    }

    /// Create or update a file by name. Returns the file metadata.
    pub async fn upsert_file(
        &self,
        name: &str,
        content: &[u8],
        mime_type: &str,
    ) -> Result<DriveFile, SyncError> {
        match self.find_file_by_name(name).await? {
            Some(existing) => self.update_file(&existing.id, content, mime_type).await,
            None => self.create_file(name, content, mime_type).await,
        }
    }
}

fn build_multipart_body(
    boundary: &str,
    metadata: &serde_json::Value,
    content: &[u8],
    mime_type: &str,
) -> Vec<u8> {
    let mut body = Vec::new();

    // Metadata part
    body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body.extend_from_slice(b"Content-Type: application/json; charset=UTF-8\r\n\r\n");
    body.extend_from_slice(metadata.to_string().as_bytes());
    body.extend_from_slice(b"\r\n");

    // Content part
    body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body.extend_from_slice(format!("Content-Type: {}\r\n\r\n", mime_type).as_bytes());
    body.extend_from_slice(content);
    body.extend_from_slice(b"\r\n");

    // Closing boundary
    body.extend_from_slice(format!("--{}--\r\n", boundary).as_bytes());

    body
}
