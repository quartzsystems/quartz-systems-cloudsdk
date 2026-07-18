//! TLS for the WebUI listener on :4443. Loads the configured cert/key PEM pair,
//! generating a self-signed pair on first start if either file is missing.
//!
//! Generation shells out to `openssl` (always present on these appliances)
//! rather than pulling a cert-generation crate — it keeps the dependency tree
//! (and the crypto backend) to just `ring`, so the .deb/.rpm builds need only a
//! C compiler. Replace the self-signed pair with your own PKI by pointing
//! `tls_cert_file` / `tls_key_file` at real certificates.

use anyhow::{Context, Result};
use std::path::Path;
use std::sync::Arc;

use rustls::pki_types::{CertificateDer, PrivateKeyDer};
use rustls::ServerConfig;

/// Build the rustls `ServerConfig` for the listener, generating a self-signed
/// certificate first if the configured pair is absent.
pub fn load_server_config(cert_path: &Path, key_path: &Path) -> Result<Arc<ServerConfig>> {
    if !cert_path.exists() || !key_path.exists() {
        generate_self_signed(cert_path, key_path)
            .with_context(|| "generating self-signed TLS certificate")?;
    }

    let certs = load_certs(cert_path)?;
    let key = load_key(key_path)?;

    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let config = ServerConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .context("selecting TLS protocol versions")?
        .with_no_client_auth()
        .with_single_cert(certs, key)
        .context("loading certificate/key into TLS config")?;

    Ok(Arc::new(config))
}

fn load_certs(path: &Path) -> Result<Vec<CertificateDer<'static>>> {
    let data = std::fs::read(path).with_context(|| format!("reading cert {}", path.display()))?;
    let mut reader = std::io::BufReader::new(&data[..]);
    let certs = rustls_pemfile::certs(&mut reader)
        .collect::<std::result::Result<Vec<_>, _>>()
        .with_context(|| format!("parsing certs in {}", path.display()))?;
    if certs.is_empty() {
        anyhow::bail!("no certificates found in {}", path.display());
    }
    Ok(certs)
}

fn load_key(path: &Path) -> Result<PrivateKeyDer<'static>> {
    let data = std::fs::read(path).with_context(|| format!("reading key {}", path.display()))?;
    let mut reader = std::io::BufReader::new(&data[..]);
    rustls_pemfile::private_key(&mut reader)
        .with_context(|| format!("parsing key in {}", path.display()))?
        .ok_or_else(|| anyhow::anyhow!("no private key found in {}", path.display()))
}

/// Generate a 10-year self-signed RSA cert/key pair via the `openssl` CLI.
fn generate_self_signed(cert_path: &Path, key_path: &Path) -> Result<()> {
    if let Some(parent) = cert_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    if let Some(parent) = key_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    tracing::info!(
        "generating self-signed TLS certificate at {}",
        cert_path.display()
    );

    let status = std::process::Command::new("openssl")
        .args([
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-nodes",
            "-days",
            "3650",
            "-subj",
            "/CN=quartz-cloudsdk-webui",
            "-keyout",
        ])
        .arg(key_path)
        .arg("-out")
        .arg(cert_path)
        .status()
        .context("running openssl (is it installed?)")?;

    if !status.success() {
        anyhow::bail!("openssl exited with status {status}");
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(key_path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}
