# RPM spec for quartz-cloudsdk-webui.
#
# Like the .deb, the Next.js frontend must be exported into backend/www BEFORE
# building (../build-rpm.sh does both, in a container with a current Rust
# toolchain + Node). The %build step compiles the Rust backend; a recent
# toolchain is expected on PATH (rustup), so cargo/rust are NOT declared as
# BuildRequires — mirroring the .deb, where distro Rust is too old.

Name:           quartz-cloudsdk-webui
Version:        0.1.0
Release:        1%{?dist}
Summary:        Quartz CloudSDK web management interface

License:        GPL-2.0-or-later
URL:            https://quartz.systems
# Built from the working tree by ../build-rpm.sh (no upstream tarball).
Source0:        %{name}-%{version}.tar.gz

BuildRequires:  gcc
BuildRequires:  systemd-rpm-macros
Requires:       openssl
%{?systemd_requires}

%description
Rust backend that serves the exported Next.js frontend over TLS on :4443 and
reverse-proxies requests to a Telecom Infra Project CloudSDK deployment,
authenticating operators against the CloudSDK security service (owsec) and
injecting the bearer token server-side. Ships a systemd unit.

%prep
%setup -q

%build
cd backend && cargo build --release

%install
rm -rf %{buildroot}
install -D -m0755 backend/target/release/%{name} \
    %{buildroot}%{_bindir}/%{name}
install -D -m0644 packaging/systemd/%{name}.service \
    %{buildroot}%{_unitdir}/%{name}.service
install -D -m0644 packaging/config/webui.toml \
    %{buildroot}%{_sysconfdir}/quartz-cloudsdk/webui.toml
mkdir -p %{buildroot}%{_datadir}/%{name}/www
if [ -d backend/www ] && ls backend/www/index.html >/dev/null 2>&1; then
    cp -r backend/www/. %{buildroot}%{_datadir}/%{name}/www/
else
    echo "W: backend/www not exported — shipping empty www (run 'npm run build' in frontend/ first)"
fi

%files
%{_bindir}/%{name}
%{_unitdir}/%{name}.service
%config(noreplace) %{_sysconfdir}/quartz-cloudsdk/webui.toml
%dir %{_datadir}/%{name}
%{_datadir}/%{name}/www

%post
%systemd_post %{name}.service
# Enable + start on first install so the WebUI comes up on :4443 immediately.
if [ $1 -eq 1 ]; then
    systemctl enable --now %{name}.service >/dev/null 2>&1 || true
fi

%preun
%systemd_preun %{name}.service

%postun
%systemd_postun_with_restart %{name}.service
if [ $1 -eq 0 ]; then
    rm -rf /var/lib/quartz-cloudsdk-webui
fi

%changelog
* Sat Jul 18 2026 Quartz Systems <cwellman@quartz.systems> - 0.1.0-1
- Initial skeleton: axum backend (TLS static server on :4443 + CloudSDK API
  proxy with owsec OAuth2 login), Next.js static-export frontend, systemd unit.
