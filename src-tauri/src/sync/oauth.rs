use super::error::SyncError;
use super::models::OAuthTokens;
use serde::Deserialize;
use tokio::sync::oneshot;

/// Google OAuth2 client ID — registered for ClipPaste desktop app.
/// This is safe to embed in client code (Google's recommendation for desktop apps).
const CLIENT_ID: &str = "86720235538-se3b18mq13hs8odmakbjkmflkfd91rgr.apps.googleusercontent.com";
const CLIENT_SECRET: &str = "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";
const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const USERINFO_URL: &str = "https://www.googleapis.com/oauth2/v2/userinfo";

/// Scope: only access app-specific hidden folder on Drive
const SCOPE: &str = "https://www.googleapis.com/auth/drive.appdata openid email";

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: u64,
}

#[derive(Deserialize)]
#[allow(dead_code)]
struct UserInfo {
    email: String,
    name: Option<String>,
}

/// Start the OAuth2 authorization flow:
/// 1. Start a local HTTP server on a random port
/// 2. Open the user's browser to Google's consent screen
/// 3. Wait for the redirect callback with the auth code
/// 4. Exchange the code for tokens
pub async fn authorize() -> Result<(OAuthTokens, String), SyncError> {
    // Find an available port
    let listener = std::net::TcpListener::bind("127.0.0.1:0")
        .map_err(|e| SyncError::Auth(format!("Failed to bind loopback: {}", e)))?;
    let port = listener.local_addr()
        .map_err(|e| SyncError::Auth(format!("Failed to get port: {}", e)))?.port();
    drop(listener); // Release so tiny_http can bind it

    let redirect_uri = format!("http://127.0.0.1:{}", port);

    // Build authorization URL
    let auth_url = format!(
        "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent",
        AUTH_URL,
        urlencoded(CLIENT_ID),
        urlencoded(&redirect_uri),
        urlencoded(SCOPE),
    );

    // Open browser (platform-specific)
    #[cfg(target_os = "windows")]
    let open_result = std::process::Command::new("rundll32").args(["url.dll,FileProtocolHandler", &auth_url]).spawn();
    #[cfg(target_os = "macos")]
    let open_result = std::process::Command::new("open").arg(&auth_url).spawn();
    #[cfg(target_os = "linux")]
    let open_result = std::process::Command::new("xdg-open").arg(&auth_url).spawn();

    if let Err(e) = open_result {
        log::error!("Failed to open browser: {}", e);
        return Err(SyncError::Auth(format!("Failed to open browser: {}. Please open this URL manually: {}", e, auth_url)));
    }

    // Start local server and wait for callback
    let (tx, rx) = oneshot::channel::<String>();
    // Run the tiny_http server in a blocking thread
    let server_handle = tokio::task::spawn_blocking(move || {
        let server = tiny_http::Server::http(format!("127.0.0.1:{}", port))
            .map_err(|e| SyncError::Auth(format!("Failed to start callback server: {}", e)))?;

        loop {
            // Wait up to 5 minutes for the callback
            let request = match server.recv_timeout(std::time::Duration::from_secs(300)) {
                Ok(Some(req)) => req,
                Ok(None) => continue,
                Err(_) => return Err(SyncError::Auth("Timed out waiting for authorization".into())),
            };

            let url = request.url().to_string();

            // Extract auth code from query parameters
            if let Some(code) = extract_query_param(&url, "code") {
                let response = tiny_http::Response::from_string(
                    "<html><body><h2>Authorization successful!</h2><p>You can close this tab and return to ClipPaste.</p></body></html>"
                ).with_header(
                    tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html"[..]).unwrap()
                );
                let _ = request.respond(response);
                let _ = tx.send(code);
                break;
            }

            if let Some(error) = extract_query_param(&url, "error") {
                let response = tiny_http::Response::from_string(
                    format!("<html><body><h2>Authorization failed</h2><p>{}</p></body></html>", error)
                );
                let _ = request.respond(response);
                return Err(SyncError::Auth(format!("User denied access: {}", error)));
            }

            // Handle favicon.ico and other non-auth requests (browsers auto-request these)
            let response = tiny_http::Response::from_string("")
                .with_status_code(204);
            let _ = request.respond(response);
        }

        Ok(())
    });

    // Wait for auth code
    let code = rx.await
        .map_err(|_| SyncError::Auth("Authorization cancelled".into()))?;

    server_handle.await
        .map_err(|e| SyncError::Auth(format!("Server task panicked: {}", e)))??;

    // Exchange code for tokens
    let tokens = exchange_code(&code, &redirect_uri).await?;

    // Get user email
    let email = get_user_email(&tokens.access_token).await?;

    Ok((tokens, email))
}

/// Exchange authorization code for access + refresh tokens.
async fn exchange_code(code: &str, redirect_uri: &str) -> Result<OAuthTokens, SyncError> {
    let client = reqwest::Client::new();
    let resp = client.post(TOKEN_URL)
        .form(&[
            ("code", code),
            ("client_id", CLIENT_ID),
            ("client_secret", CLIENT_SECRET),
            ("redirect_uri", redirect_uri),
            ("grant_type", "authorization_code"),
        ])
        .send().await
        .map_err(|e| SyncError::Network(format!("Token exchange failed: {}", e)))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(SyncError::Auth(format!("Token exchange failed: {}", body)));
    }

    let token_resp: TokenResponse = resp.json().await
        .map_err(|e| SyncError::Auth(format!("Failed to parse token response: {}", e)))?;

    let refresh_token = token_resp.refresh_token
        .ok_or_else(|| SyncError::Auth("No refresh token received".into()))?;

    Ok(OAuthTokens {
        access_token: token_resp.access_token,
        refresh_token,
        expires_at: chrono::Utc::now().timestamp() + token_resp.expires_in as i64,
    })
}

/// Refresh an expired access token using the refresh token.
pub async fn refresh_token(refresh_token: &str) -> Result<OAuthTokens, SyncError> {
    let client = reqwest::Client::new();
    let resp = client.post(TOKEN_URL)
        .form(&[
            ("refresh_token", refresh_token),
            ("client_id", CLIENT_ID),
            ("client_secret", CLIENT_SECRET),
            ("grant_type", "refresh_token"),
        ])
        .send().await
        .map_err(|e| SyncError::Network(format!("Token refresh failed: {}", e)))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(SyncError::Auth(format!("Token refresh failed: {}", body)));
    }

    let token_resp: TokenResponse = resp.json().await
        .map_err(|e| SyncError::Auth(format!("Failed to parse refresh response: {}", e)))?;

    Ok(OAuthTokens {
        access_token: token_resp.access_token,
        refresh_token: token_resp.refresh_token.unwrap_or_else(|| refresh_token.to_string()),
        expires_at: chrono::Utc::now().timestamp() + token_resp.expires_in as i64,
    })
}

/// Get user's email from Google userinfo endpoint.
async fn get_user_email(access_token: &str) -> Result<String, SyncError> {
    let client = reqwest::Client::new();
    let resp = client.get(USERINFO_URL)
        .bearer_auth(access_token)
        .send().await
        .map_err(|e| SyncError::Network(format!("Failed to get user info: {}", e)))?;

    if !resp.status().is_success() {
        return Err(SyncError::Auth("Failed to get user email".into()));
    }

    let info: UserInfo = resp.json().await
        .map_err(|e| SyncError::Auth(format!("Failed to parse user info: {}", e)))?;

    Ok(info.email)
}

/// Revoke access (disconnect).
pub async fn revoke_token(token: &str) -> Result<(), SyncError> {
    let client = reqwest::Client::new();
    let _ = client.post("https://oauth2.googleapis.com/revoke")
        .form(&[("token", token)])
        .send().await;
    Ok(())
}

fn extract_query_param(url: &str, param: &str) -> Option<String> {
    let query = url.split('?').nth(1)?;
    for pair in query.split('&') {
        let mut kv = pair.splitn(2, '=');
        if let (Some(key), Some(value)) = (kv.next(), kv.next()) {
            if key == param {
                return Some(urlencoded_decode(value));
            }
        }
    }
    None
}

fn urlencoded(s: &str) -> String {
    let mut result = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                result.push(b as char);
            }
            _ => {
                result.push_str(&format!("%{:02X}", b));
            }
        }
    }
    result
}

fn urlencoded_decode(s: &str) -> String {
    let mut result = Vec::new();
    let mut chars = s.bytes();
    while let Some(b) = chars.next() {
        if b == b'%' {
            let hi = chars.next().unwrap_or(b'0');
            let lo = chars.next().unwrap_or(b'0');
            let byte = u8::from_str_radix(&format!("{}{}", hi as char, lo as char), 16).unwrap_or(0);
            result.push(byte);
        } else if b == b'+' {
            result.push(b' ');
        } else {
            result.push(b);
        }
    }
    String::from_utf8_lossy(&result).to_string()
}
