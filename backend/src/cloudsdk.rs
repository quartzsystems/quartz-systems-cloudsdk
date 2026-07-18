//! Thin client for the CloudSDK security service (owsec). Handles the OAuth2
//! sign-in exchange and token revocation. The bearer token owsec returns is
//! held server-side (in the session store) and injected into proxied
//! `/api/cloudsdk/*` requests — it never reaches the browser.

use serde::Deserialize;
use std::sync::Arc;

use crate::{
    error::{AppError, Result},
    AppState,
};

/// The subset of owsec's OAuth2 login response we care about. owsec returns a
/// larger object (idle timeout, ACL template, etc.); serde ignores the rest.
#[derive(Debug, Deserialize)]
pub struct OAuthToken {
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: Option<String>,
    /// Seconds until the access token expires.
    #[serde(default)]
    pub expires_in: Option<u64>,
    /// The authenticated user's identity (usually the email/userId).
    #[serde(default)]
    pub username: Option<String>,
}

/// Verify `username`/`password` against owsec's OAuth2 endpoint. On success
/// returns the token bundle; any non-2xx (owsec answers 403 for bad
/// credentials) maps to a uniform `Unauthorized`.
pub async fn oauth2_login(
    state: &Arc<AppState>,
    username: &str,
    password: &str,
) -> Result<OAuthToken> {
    let url = format!(
        "{}/api/v1/oauth2",
        state.config.cloudsdk_owsec_url.trim_end_matches('/')
    );
    let resp = state
        .http
        .post(&url)
        .json(&serde_json::json!({ "userId": username, "password": password }))
        .send()
        .await
        .map_err(|e| AppError::Gateway(format!("owsec unreachable: {e}")))?;

    let status = resp.status();
    if !status.is_success() {
        // 401/403 → bad credentials. Anything else (owsec down, 5xx) is worth a
        // log line but still a failed login from the browser's point of view.
        if status.as_u16() != 401 && status.as_u16() != 403 {
            tracing::warn!(%status, "owsec login returned non-auth error");
        } else {
            tracing::info!(user = %username, "owsec rejected credentials");
        }
        return Err(AppError::Unauthorized);
    }

    resp.json::<OAuthToken>()
        .await
        .map_err(|e| AppError::Gateway(format!("owsec returned an unexpected body: {e}")))
}

/// Best-effort revocation of an access token at logout. Failures are logged and
/// swallowed — the local session is dropped regardless.
pub async fn revoke_token(state: &Arc<AppState>, access_token: &str) {
    let url = format!(
        "{}/api/v1/oauth2/{}",
        state.config.cloudsdk_owsec_url.trim_end_matches('/'),
        access_token
    );
    match state
        .http
        .delete(&url)
        .bearer_auth(access_token)
        .send()
        .await
    {
        Ok(r) if !r.status().is_success() => {
            tracing::debug!(status = %r.status(), "owsec token revoke returned non-success")
        }
        Ok(_) => {}
        Err(e) => tracing::debug!("owsec token revoke failed: {e}"),
    }
}
