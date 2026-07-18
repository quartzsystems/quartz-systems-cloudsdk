use axum::{
    body::Body,
    extract::{Request, State},
    http::{HeaderName, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use std::sync::Arc;

use crate::{auth::Session, AppState};

/// Hop-by-hop headers that must not be forwarded across the proxy boundary.
const STRIP_HEADERS: &[&str] = &[
    "host",
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
];

/// Reverse-proxy `/api/cloudsdk/*` to the CloudSDK gateway (owgw). The incoming
/// path `/api/cloudsdk/api/v1/devices` maps to `<cloudsdk_api_url>/api/v1/devices`.
pub async fn cloudsdk(State(state): State<Arc<AppState>>, req: Request) -> Response {
    let base = state.config.cloudsdk_api_url.clone();
    proxy(state, req, "/api/cloudsdk", &base).await
}

/// Reverse-proxy `/api/owprov/*` to the CloudSDK provisioning service (owprov).
/// The incoming path `/api/owprov/api/v1/entity` maps to
/// `<cloudsdk_owprov_url>/api/v1/entity`. Backs the Organization switcher.
pub async fn owprov(State(state): State<Arc<AppState>>, req: Request) -> Response {
    let base = state.config.cloudsdk_owprov_url.clone();
    proxy(state, req, "/api/owprov", &base).await
}

/// Shared proxy body: strip `prefix`, forward to `base`, inject the session's
/// bearer token server-side. The browser never sees the token.
async fn proxy(state: Arc<AppState>, req: Request, prefix: &'static str, base: &str) -> Response {
    // `require_auth` guarantees a session in the extensions.
    let Some(session) = req.extensions().get::<Session>().cloned() else {
        return (StatusCode::UNAUTHORIZED, "no session").into_response();
    };
    match forward(state, req, session, prefix, base).await {
        Ok(resp) => resp,
        Err(e) => {
            tracing::error!("proxy error: {e:#}");
            (StatusCode::BAD_GATEWAY, "upstream CloudSDK API unreachable").into_response()
        }
    }
}

async fn forward(
    state: Arc<AppState>,
    req: Request,
    session: Session,
    prefix: &'static str,
    base: &str,
) -> anyhow::Result<Response> {
    let (parts, body) = req.into_parts();

    // Strip the route prefix; the CloudSDK endpoints live at the root of the
    // upstream base URL.
    let path = parts.uri.path_and_query().map(|pq| pq.as_str()).unwrap_or(prefix);
    let path = path.strip_prefix(prefix).unwrap_or(path);
    let path = if path.is_empty() { "/" } else { path };
    let url = format!("{}{}", base.trim_end_matches('/'), path);

    let body_bytes = axum::body::to_bytes(body, usize::MAX).await?.to_vec();

    let mut builder = state
        .http
        .request(parts.method.clone(), &url)
        .body(body_bytes);

    // Forward client headers, except hop-by-hop ones, the session cookie (the
    // CloudSDK API has no business seeing our JWT), any client-supplied
    // Authorization (we set our own below), and the length we let reqwest set.
    for (name, value) in parts.headers.iter() {
        let n = name.as_str().to_ascii_lowercase();
        if STRIP_HEADERS.contains(&n.as_str())
            || n == "cookie"
            || n == "authorization"
            || n == "content-length"
        {
            continue;
        }
        builder = builder.header(name, value);
    }

    // Inject the CloudSDK bearer token held server-side for this session.
    builder = builder.header(
        HeaderName::from_static("authorization"),
        HeaderValue::from_str(&format!("Bearer {}", session.cloudsdk_token))?,
    );

    let upstream = builder.send().await?;

    let status = upstream.status();
    let mut resp = Response::builder().status(status);
    for (name, value) in upstream.headers().iter() {
        let n = name.as_str().to_ascii_lowercase();
        if STRIP_HEADERS.contains(&n.as_str()) {
            continue;
        }
        resp = resp.header(name, value);
    }

    let stream = upstream.bytes_stream();
    Ok(resp.body(Body::from_stream(stream))?)
}
