// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

mod auth;
mod cloudsdk;
mod config;
mod error;
mod proxy;
mod tls;

use anyhow::Result;
use axum::{
    extract::Request,
    http::{header, HeaderValue},
    middleware::{self, Next},
    response::Response,
    routing::{any, get, post},
    Router,
};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio_rustls::TlsAcceptor;
use tower::ServiceExt as _;
use tower_http::{
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};

use auth::Session;
use config::Config;

/// Shared state handed to every request handler.
pub struct AppState {
    pub config: Config,
    /// HTTP client for talking to the CloudSDK microservices.
    pub http: reqwest::Client,
    /// Secret used to sign session JWTs (see `auth::load_jwt_secret`).
    pub jwt_secret: String,
    /// In-memory session store: session id → live session (holds the CloudSDK
    /// bearer token server-side). Restarting the backend ends all sessions.
    pub sessions: Mutex<HashMap<String, Session>>,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "quartz_cloudsdk_webui=info,tower_http=info".into()),
        )
        .init();

    // Install the ring crypto provider process-wide (matches reqwest's rustls).
    let _ = rustls::crypto::ring::default_provider().install_default();

    let config_path = std::env::var("QUARTZ_CLOUDSDK_WEBUI_CONFIG")
        .unwrap_or_else(|_| "/etc/quartz-cloudsdk/webui.toml".into());
    let config = Config::load(&config_path)?;
    tracing::info!(?config, "loaded configuration");

    let http = reqwest::Client::builder()
        // CloudSDK services are reached over loopback and usually serve their
        // own self-signed certs; accept them when configured to.
        .danger_accept_invalid_certs(config.cloudsdk_accept_invalid_certs)
        .build()?;

    let listen = config.listen.clone();
    let www_root = config.www_root.clone();
    let tls_config = tls::load_server_config(&config.tls_cert_file, &config.tls_key_file)?;
    let jwt_secret = auth::load_jwt_secret(&config.jwt_secret_file);
    let state = Arc::new(AppState {
        config,
        http,
        jwt_secret,
        sessions: Mutex::new(HashMap::new()),
    });

    // Everything except the SPA itself and login/logout requires a session; the
    // CloudSDK API proxy is behind `require_auth` so no upstream call can be
    // made without one.
    let protected = Router::new()
        .route("/api/auth/me", get(auth::me))
        // Static routes win over the proxy wildcards.
        // owgw (gateway/device operations):
        .route("/api/cloudsdk", any(proxy::cloudsdk))
        .route("/api/cloudsdk/*rest", any(proxy::cloudsdk))
        // owprov (Organizations/entities + Venues — the org switcher):
        .route("/api/owprov", any(proxy::owprov))
        .route("/api/owprov/*rest", any(proxy::owprov))
        // owsec (operator accounts — Settings → Security):
        .route("/api/owsec", any(proxy::owsec))
        .route("/api/owsec/*rest", any(proxy::owsec))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth::require_auth,
        ));

    // Static SPA (public — it's just the login shell until a session exists).
    // `ServeDir` falls back to index.html for page navigations so client-side
    // routing works; hashed asset paths (/_next/*) still 404 honestly.
    let spa_service =
        ServeDir::new(&www_root).not_found_service(ServeFile::new(www_root.join("index.html")));
    let static_router = Router::new()
        .nest_service("/_next", ServeDir::new(www_root.join("_next")))
        .fallback_service(spa_service)
        .layer(middleware::from_fn(static_cache_control));

    let app = Router::new()
        .route("/api/auth/login", post(auth::login))
        .route("/api/auth/logout", post(auth::logout))
        .merge(protected)
        .fallback_service(static_router)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let acceptor = TlsAcceptor::from(tls_config);
    let listener = tokio::net::TcpListener::bind(&listen).await?;
    tracing::info!("Quartz CloudSDK WebUI listening on https://{listen}");

    // Accept connections manually so each socket gets TCP_NODELAY and its own
    // TLS handshake before being handed to the axum router.
    loop {
        let (socket, _addr) = match listener.accept().await {
            Ok(conn) => conn,
            Err(e) => {
                tracing::warn!("accept failed: {e}");
                continue;
            }
        };
        let _ = socket.set_nodelay(true);
        let acceptor = acceptor.clone();
        let router = app.clone();
        tokio::spawn(async move {
            let tls_stream = match acceptor.accept(socket).await {
                Ok(s) => s,
                Err(e) => {
                    tracing::debug!("TLS handshake failed: {e}");
                    return;
                }
            };
            let service = hyper::service::service_fn(
                move |request: hyper::Request<hyper::body::Incoming>| router.clone().oneshot(request),
            );
            if let Err(e) =
                hyper_util::server::conn::auto::Builder::new(hyper_util::rt::TokioExecutor::new())
                    .serve_connection_with_upgrades(hyper_util::rt::TokioIo::new(tls_stream), service)
                    .await
            {
                tracing::debug!("connection error: {e}");
            }
        });
    }
}

/// Cache policy for the static SPA. Hashed Next.js assets never change under the
/// same name, so they cache forever; everything else (HTML shells, favicon)
/// revalidates on every load.
async fn static_cache_control(req: Request, next: Next) -> Response {
    let hashed_asset = req.uri().path().starts_with("/_next/static/");
    let mut resp = next.run(req).await;
    let immutable = hashed_asset && resp.status().is_success();
    resp.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static(if immutable {
            "public, max-age=31536000, immutable"
        } else {
            "no-cache"
        }),
    );
    resp
}
