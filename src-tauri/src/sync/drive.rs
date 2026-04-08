use super::error::SyncError;
use serde::{Deserialize, Serialize};

const DRIVE_FILES_URL: &str = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL: &str = "https://www.googleapis.com/upload/drive/v3/files";

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

impl DriveClient {
    pub fn new(access_token: &str) -> Self {
        Self {
            client: reqwest::Client::new(),
            access_token: access_token.to_string(),
        }
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

            let mut req = self.client.get(DRIVE_FILES_URL)
                .bearer_auth(&self.access_token)
                .query(&[
                    ("spaces", "appDataFolder"),
                    ("q", &q),
                    ("fields", "files(id,name,modifiedTime,mimeType,size),nextPageToken"),
                    ("pageSize", "1000"),
                ]);

            if let Some(ref token) = page_token {
                req = req.query(&[("pageToken", token.as_str())]);
            }

            let resp = req.send().await
                .map_err(|e| SyncError::Network(e.to_string()))?;

            let status = resp.status();
            if !status.is_success() {
                let body = resp.text().await.unwrap_or_default();
                return Err(SyncError::DriveApi(status.as_u16(), body));
            }

            let file_list: FileList = resp.json().await
                .map_err(|e| SyncError::Serialization(e.to_string()))?;

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
        let q = format!("'appDataFolder' in parents and name = '{}'", name.replace('\'', "\\'"));
        let resp = self.client.get(DRIVE_FILES_URL)
            .bearer_auth(&self.access_token)
            .query(&[
                ("spaces", "appDataFolder"),
                ("q", &q),
                ("fields", "files(id,name,modifiedTime,mimeType,size)"),
                ("pageSize", "1"),
            ])
            .send().await
            .map_err(|e| SyncError::Network(e.to_string()))?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(SyncError::DriveApi(status.as_u16(), body));
        }

        let file_list: FileList = resp.json().await
            .map_err(|e| SyncError::Serialization(e.to_string()))?;

        Ok(file_list.files.into_iter().next())
    }

    /// Create a new file in appDataFolder.
    pub async fn create_file(&self, name: &str, content: &[u8], mime_type: &str) -> Result<DriveFile, SyncError> {
        let metadata = serde_json::json!({
            "name": name,
            "parents": ["appDataFolder"],
        });

        let boundary = "clippaste_boundary_xyz";
        let body = build_multipart_body(boundary, &metadata, content, mime_type);

        let resp = self.client.post(DRIVE_UPLOAD_URL)
            .bearer_auth(&self.access_token)
            .query(&[("uploadType", "multipart"), ("fields", "id,name,modifiedTime,mimeType,size")])
            .header("Content-Type", format!("multipart/related; boundary={}", boundary))
            .body(body)
            .send().await
            .map_err(|e| SyncError::Network(e.to_string()))?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(SyncError::DriveApi(status.as_u16(), body));
        }

        resp.json().await.map_err(|e| SyncError::Serialization(e.to_string()))
    }

    /// Update an existing file's content.
    pub async fn update_file(&self, file_id: &str, content: &[u8], mime_type: &str) -> Result<DriveFile, SyncError> {
        let url = format!("{}/{}", DRIVE_UPLOAD_URL, file_id);
        let resp = self.client.patch(&url)
            .bearer_auth(&self.access_token)
            .query(&[("uploadType", "media"), ("fields", "id,name,modifiedTime,mimeType,size")])
            .header("Content-Type", mime_type)
            .body(content.to_vec())
            .send().await
            .map_err(|e| SyncError::Network(e.to_string()))?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(SyncError::DriveApi(status.as_u16(), body));
        }

        resp.json().await.map_err(|e| SyncError::Serialization(e.to_string()))
    }

    /// Download a file's content by file ID.
    pub async fn download_file(&self, file_id: &str) -> Result<Vec<u8>, SyncError> {
        let url = format!("{}/{}?alt=media", DRIVE_FILES_URL, file_id);
        let resp = self.client.get(&url)
            .bearer_auth(&self.access_token)
            .send().await
            .map_err(|e| SyncError::Network(e.to_string()))?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(SyncError::DriveApi(status.as_u16(), body));
        }

        resp.bytes().await
            .map(|b| b.to_vec())
            .map_err(|e| SyncError::Network(e.to_string()))
    }

    /// Delete a file by ID.
    pub async fn delete_file(&self, file_id: &str) -> Result<(), SyncError> {
        let url = format!("{}/{}", DRIVE_FILES_URL, file_id);
        let resp = self.client.delete(&url)
            .bearer_auth(&self.access_token)
            .send().await
            .map_err(|e| SyncError::Network(e.to_string()))?;

        let status = resp.status();
        if !status.is_success() && status.as_u16() != 404 {
            let body = resp.text().await.unwrap_or_default();
            return Err(SyncError::DriveApi(status.as_u16(), body));
        }

        Ok(())
    }

    /// Create or update a file by name. Returns the file metadata.
    pub async fn upsert_file(&self, name: &str, content: &[u8], mime_type: &str) -> Result<DriveFile, SyncError> {
        match self.find_file_by_name(name).await? {
            Some(existing) => self.update_file(&existing.id, content, mime_type).await,
            None => self.create_file(name, content, mime_type).await,
        }
    }
}

fn build_multipart_body(boundary: &str, metadata: &serde_json::Value, content: &[u8], mime_type: &str) -> Vec<u8> {
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
