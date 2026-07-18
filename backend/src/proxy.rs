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

/// Reverse-proxy any `/api/cloudsdk/*` request to the configured CloudSDK API,
/// injecting the session's bearer token server-side. The browser never sees the
/// token.
///
/// The incoming path `/api/cloudsdk/api/v1/devices` maps to
/// `<cloudsdk_api_url>/api/v1/devices`.
pub async fn handler(State(state): State<Arc<AppState>>, req: Request) -> Response {
    // `require_auth` guarantees a session in the extensions.
    let Some(session) = req.extensions().get::<Session>().cloned() else {
        return (StatusCode::UNAUTHORIZED, "no session").into_response();
    };
    match forward(state, req, session).await {
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
) -> anyhow::Result<Response> {
    let (parts, body) = req.into_parts();

    // Strip the `/api/cloudsdk` prefix; the CloudSDK endpoints live at the root
    // of the upstream base URL.
    let path = parts
        .uri
        .path_and_query()
        .map(|pq| pq.as_str())
        .unwrap_or("/api/cloudsdk");
    let path = path.strip_prefix("/api/cloudsdk").unwrap_or(path);
    let path = if path.is_empty() { "/" } else { path };
    let url = format!(
        "{}{}",
        state.config.cloudsdk_api_url.trim_end_matches('/'),
        path
    );

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
