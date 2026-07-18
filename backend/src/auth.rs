//! Session authentication against the CloudSDK security service (owsec).
//!
//! Login flow:
//!  1. The browser POSTs `{username, password}` to `/api/auth/login`.
//!  2. The backend forwards the credentials to owsec's OAuth2 endpoint. On
//!     success owsec returns a bearer token, which the backend stores in an
//!     in-memory **session store** keyed by a random session id — the token
//!     never reaches the browser.
//!  3. The backend issues its own JWT (carrying only the session id) in an
//!     httpOnly `SameSite=Lax` cookie (`Secure` in production). JS can never
//!     read the cookie; the only client-side state is a non-sensitive cached
//!     user for display.
//!  4. `require_auth` gates every `/api/*` route — including the CloudSDK API
//!     proxy — so nothing can be read or changed without a valid session, and
//!     the proxy pulls the CloudSDK token from the session to authorize
//!     upstream.
//!
//! The session store is in-memory, so a backend restart ends all sessions
//! (users simply sign in again). That is a deliberate simplification for the
//! scaffold; a persistent store can slot in behind the same `AppState` API.

use axum::{
    extract::{Request, State},
    http::{header::SET_COOKIE, HeaderMap},
    middleware::Next,
    response::{IntoResponse, Response},
};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::{
    cloudsdk,
    error::{AppError, Result},
    AppState,
};

pub const COOKIE_NAME: &str = "quartz_cloudsdk_token";

/// A live session. Holds the CloudSDK bearer token server-side so the browser
/// never sees it; the proxy reads `cloudsdk_token` to authorize upstream calls.
#[derive(Debug, Clone)]
pub struct Session {
    pub username: String,
    pub cloudsdk_token: String,
    #[allow(dead_code)] // used when refresh support lands
    pub refresh_token: Option<String>,
    /// Unix seconds after which this session is dead.
    pub expires_at: u64,
}

/// JWT payload. `sub` is the opaque session id (a key into the session store),
/// not the username — the username lives only in the server-side session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub exp: usize,
    pub iat: usize,
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

// ── JWT ─────────────────────────────────────────────────────────────────────

fn encode_token(claims: &Claims, secret: &str) -> anyhow::Result<String> {
    encode(
        &Header::default(),
        claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| anyhow::anyhow!("token encode failed: {e}"))
}

fn decode_token(token: &str, secret: &str) -> anyhow::Result<Claims> {
    decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .map(|data| data.claims)
    .map_err(|e| anyhow::anyhow!("token decode failed: {e}"))
}

/// Load the JWT signing secret from `config.jwt_secret_file`, generating and
/// persisting a random one on first start (the systemd unit provides a writable
/// `StateDirectory`). Falls back to an ephemeral in-memory secret if the file
/// cannot be written (local dev) — sessions then die with the process.
pub fn load_jwt_secret(path: &std::path::Path) -> String {
    match std::fs::read_to_string(path) {
        Ok(s) if !s.trim().is_empty() => return s.trim().to_string(),
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => tracing::warn!("could not read jwt secret {}: {e}", path.display()),
    }

    let bytes: [u8; 32] = rand::random();
    let secret: String = bytes.iter().map(|b| format!("{b:02x}")).collect();

    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    match std::fs::write(path, &secret) {
        Ok(()) => {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
            }
            tracing::info!("generated new session secret at {}", path.display());
        }
        Err(e) => tracing::warn!(
            "could not persist session secret to {} ({e}); sessions will not survive restarts",
            path.display()
        ),
    }
    secret
}

// ── Cookies ─────────────────────────────────────────────────────────────────

fn session_cookie(token: &str, secure: bool, max_age_secs: u64) -> String {
    let mut c =
        format!("{COOKIE_NAME}={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age={max_age_secs}");
    if secure {
        c.push_str("; Secure");
    }
    c
}

fn clear_cookie(secure: bool) -> String {
    let mut c = format!("{COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
    if secure {
        c.push_str("; Secure");
    }
    c
}

/// Pull the JWT from the session cookie, falling back to `Authorization: Bearer`
/// (handy for curl/tests).
fn extract_token(headers: &HeaderMap) -> Option<String> {
    if let Some(cookie) = headers
        .get(axum::http::header::COOKIE)
        .and_then(|v| v.to_str().ok())
    {
        for part in cookie.split(';') {
            if let Some(val) = part.trim().strip_prefix(&format!("{COOKIE_NAME}=")) {
                if !val.is_empty() {
                    return Some(val.to_string());
                }
            }
        }
    }
    headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .map(str::to_string)
}

// ── Routes ──────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct LoginRequest {
    username: String,
    password: String,
}

/// The user object returned to the SPA (display only).
fn user_body(username: &str) -> Value {
    serde_json::json!({ "username": username, "role": "operator" })
}

/// POST /api/auth/login — public.
pub async fn login(
    State(state): State<Arc<AppState>>,
    axum::Json(body): axum::Json<LoginRequest>,
) -> Result<Response> {
    if body.username.is_empty() || body.password.is_empty() {
        return Err(AppError::BadRequest(
            "username and password are required".into(),
        ));
    }

    let token = cloudsdk::oauth2_login(&state, &body.username, &body.password).await?;
    let username = token.username.clone().unwrap_or_else(|| body.username.clone());
    tracing::info!(user = %username, "login ok");

    // Mint a session id, store the CloudSDK token against it server-side.
    let sid_bytes: [u8; 32] = rand::random();
    let session_id: String = sid_bytes.iter().map(|b| format!("{b:02x}")).collect();

    let ttl_secs = state.config.session_hours * 3600;
    // Cap our session at the CloudSDK token's own lifetime when it is shorter.
    let expires_at = now_secs()
        + token
            .expires_in
            .map(|e| e.min(ttl_secs))
            .unwrap_or(ttl_secs);

    state.sessions.lock().unwrap().insert(
        session_id.clone(),
        Session {
            username: username.clone(),
            cloudsdk_token: token.access_token,
            refresh_token: token.refresh_token,
            expires_at,
        },
    );

    let iat = now_secs();
    let claims = Claims {
        sub: session_id,
        iat: iat as usize,
        exp: expires_at as usize,
    };
    let jwt = encode_token(&claims, &state.jwt_secret).map_err(AppError::Internal)?;
    let cookie = session_cookie(&jwt, state.config.cookie_secure, expires_at - iat);

    Ok(([(SET_COOKIE, cookie)], axum::Json(user_body(&username))).into_response())
}

/// POST /api/auth/logout — public (clearing a cookie needs no session). Best-
/// effort: drops the local session and revokes the CloudSDK token upstream.
pub async fn logout(State(state): State<Arc<AppState>>, headers: HeaderMap) -> Response {
    if let Some(jwt) = extract_token(&headers) {
        if let Ok(claims) = decode_token(&jwt, &state.jwt_secret) {
            let session = state.sessions.lock().unwrap().remove(&claims.sub);
            if let Some(session) = session {
                cloudsdk::revoke_token(&state, &session.cloudsdk_token).await;
            }
        }
    }
    (
        [(SET_COOKIE, clear_cookie(state.config.cookie_secure))],
        axum::Json(serde_json::json!({ "ok": true })),
    )
        .into_response()
}

/// GET /api/auth/me — behind `require_auth`. The cookie is httpOnly, so this is
/// how the SPA learns whether (and as whom) it is logged in.
pub async fn me(req: Request) -> Result<axum::Json<Value>> {
    let session = req
        .extensions()
        .get::<Session>()
        .ok_or(AppError::Unauthorized)?;
    Ok(axum::Json(user_body(&session.username)))
}

// ── Middleware ──────────────────────────────────────────────────────────────

/// Requires a valid session (cookie or Bearer). Looks the session up in the
/// store and inserts a clone into the request extensions for downstream
/// handlers (the proxy reads the CloudSDK token from it).
pub async fn require_auth(
    State(state): State<Arc<AppState>>,
    mut req: Request,
    next: Next,
) -> Result<Response> {
    let jwt = extract_token(req.headers()).ok_or(AppError::Unauthorized)?;
    let claims = decode_token(&jwt, &state.jwt_secret).map_err(|_| AppError::Unauthorized)?;

    let session = {
        let mut store = state.sessions.lock().unwrap();
        match store.get(&claims.sub) {
            Some(s) if s.expires_at > now_secs() => s.clone(),
            Some(_) => {
                // Expired — evict and reject so the SPA bounces to login.
                store.remove(&claims.sub);
                return Err(AppError::Unauthorized);
            }
            None => return Err(AppError::Unauthorized),
        }
    };

    req.extensions_mut().insert(session);
    Ok(next.run(req).await)
}
