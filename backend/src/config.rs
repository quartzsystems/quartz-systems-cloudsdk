// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Quartz Systems

use anyhow::{Context, Result};
use serde::Deserialize;
use std::path::PathBuf;

/// Runtime configuration, loaded from `/etc/quartz-cloudsdk/webui.toml`.
#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    /// Address the server binds to (TLS terminated here). The WebUI is
    /// presented on :4443.
    #[serde(default = "default_listen")]
    pub listen: String,

    /// Base URL of the CloudSDK security service (owsec). Sign-in credentials
    /// are verified against its OAuth2 endpoint.
    #[serde(default = "default_owsec_url")]
    pub cloudsdk_owsec_url: String,

    /// Base URL the authenticated `/api/cloudsdk/*` proxy forwards to. Defaults
    /// to the CloudSDK gateway (owgw) — device/gateway operations.
    #[serde(default = "default_api_url")]
    pub cloudsdk_api_url: String,

    /// Base URL the authenticated `/api/owprov/*` proxy forwards to. The
    /// CloudSDK provisioning service (owprov) owns Organizations (entities) and
    /// Venues, which the console's Organization switcher reads.
    #[serde(default = "default_owprov_url")]
    pub cloudsdk_owprov_url: String,

    /// Base URL the authenticated `/api/owfms/*` proxy forwards to. The CloudSDK
    /// firmware service (owfms) owns firmware revisions and upgrade status,
    /// backing the Infrastructure → Firmware view.
    #[serde(default = "default_owfms_url")]
    pub cloudsdk_owfms_url: String,

    /// Base URL the authenticated `/api/owanalytics/*` proxy forwards to. The
    /// CloudSDK analytics service (owanalytics) owns venue boards and historical
    /// time series, backing the Dashboard's alarms and Historical Trends.
    #[serde(default = "default_owanalytics_url")]
    pub cloudsdk_owanalytics_url: String,

    /// Accept self-signed TLS from the CloudSDK services. They are reached over
    /// loopback and typically serve their own self-signed certificates, so this
    /// is true by default. Set false if you front them with a trusted PKI.
    #[serde(default = "default_accept_invalid_certs")]
    pub cloudsdk_accept_invalid_certs: bool,

    /// Directory holding the exported Next.js frontend.
    #[serde(default = "default_www_root")]
    pub www_root: PathBuf,

    /// TLS certificate + private key (PEM) presented on `listen`. Generated as
    /// a self-signed pair on first start if absent (see `tls.rs`).
    #[serde(default = "default_tls_cert_file")]
    pub tls_cert_file: PathBuf,
    #[serde(default = "default_tls_key_file")]
    pub tls_key_file: PathBuf,

    /// File holding the JWT session-signing secret. Generated on first start if
    /// absent; the systemd unit's `StateDirectory=` makes it writable.
    #[serde(default = "default_jwt_secret_file")]
    pub jwt_secret_file: PathBuf,

    /// Mark the session cookie `Secure` (HTTPS-only). True in production — the
    /// WebUI is always served over TLS; set false only for plain-HTTP local dev.
    #[serde(default = "default_cookie_secure")]
    pub cookie_secure: bool,

    /// Session (cookie) lifetime in hours.
    #[serde(default = "default_session_hours")]
    pub session_hours: u64,
}

fn default_listen() -> String {
    "0.0.0.0:4443".to_string()
}
fn default_owsec_url() -> String {
    // owsec's default REST port in a CloudSDK deployment.
    "https://127.0.0.1:16001".to_string()
}
fn default_api_url() -> String {
    // owgw (the CloudSDK gateway) default REST port.
    "https://127.0.0.1:16002".to_string()
}
fn default_owprov_url() -> String {
    // owprov (the CloudSDK provisioning service) default REST port.
    "https://127.0.0.1:16005".to_string()
}
fn default_owfms_url() -> String {
    // owfms (the CloudSDK firmware service) default REST port.
    "https://127.0.0.1:16004".to_string()
}
fn default_owanalytics_url() -> String {
    // owanalytics (the CloudSDK analytics service) default REST port.
    "https://127.0.0.1:16009".to_string()
}
fn default_accept_invalid_certs() -> bool {
    true
}
fn default_www_root() -> PathBuf {
    PathBuf::from("/usr/share/quartz-cloudsdk-webui/www")
}
fn default_tls_cert_file() -> PathBuf {
    PathBuf::from("/var/lib/quartz-cloudsdk-webui/tls/cert.pem")
}
fn default_tls_key_file() -> PathBuf {
    PathBuf::from("/var/lib/quartz-cloudsdk-webui/tls/key.pem")
}
fn default_jwt_secret_file() -> PathBuf {
    PathBuf::from("/var/lib/quartz-cloudsdk-webui/jwt.secret")
}
fn default_cookie_secure() -> bool {
    true
}
fn default_session_hours() -> u64 {
    12
}

impl Config {
    /// Load config from `path`, falling back to built-in defaults if the file
    /// is absent (useful for local `cargo run`).
    pub fn load(path: &str) -> Result<Self> {
        match std::fs::read_to_string(path) {
            Ok(text) => toml::from_str(&text).with_context(|| format!("parsing config {path}")),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                tracing::warn!("config {path} not found, using defaults");
                Ok(toml::from_str("").unwrap())
            }
            Err(e) => Err(e).with_context(|| format!("reading config {path}")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// An empty config file must fall back to the built-in defaults, and the
    /// WebUI must land on :4443.
    #[test]
    fn empty_config_uses_defaults() {
        let cfg: Config = toml::from_str("").unwrap();
        assert_eq!(cfg.listen, "0.0.0.0:4443");
        assert!(cfg.cloudsdk_owsec_url.starts_with("https://"));
    }
}
