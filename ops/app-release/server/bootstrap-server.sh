#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  printf 'ERROR: bootstrap-server.sh must run as root\n' >&2
  exit 2
fi

SOURCE_DIR="${1:-}"
if [[ -z "${SOURCE_DIR}" || ! -d "${SOURCE_DIR}" ]]; then
  printf 'ERROR: extracted deployment directory is required\n' >&2
  exit 2
fi

PUBLIC_KEY_FILE="${SOURCE_DIR}/release_authorized_key.pub"
if [[ ! -f "${PUBLIC_KEY_FILE}" || "$(wc -l < "${PUBLIC_KEY_FILE}")" -ne 1 ]]; then
  printf 'ERROR: deployment package must contain one SSH public key line\n' >&2
  exit 2
fi
if ! grep -Eq '^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(256|384|521)) [A-Za-z0-9+/=]+([[:space:]].*)?$' "${PUBLIC_KEY_FILE}"; then
  printf 'ERROR: unsupported SSH public key format\n' >&2
  exit 2
fi

if ! getent passwd ideabox-release >/dev/null; then
  useradd --create-home --user-group --shell /bin/bash ideabox-release
  passwd -l ideabox-release >/dev/null
fi

install -d -o root -g root -m 0755 /opt/ideabox-release /opt/ideabox-release/lib /opt/ideabox-release/lib/server /opt/ideabox-release/bin
install -d -o root -g ideabox-release -m 0750 /etc/ideabox-release
if [[ ! -e /etc/ideabox-release/ossutilconfig ]]; then
  install -o ideabox-release -g ideabox-release -m 0600 /dev/null /etc/ideabox-release/ossutilconfig
fi
install -d -o ideabox-release -g ideabox-release -m 0750 \
  /srv/ideabox-release \
  /srv/ideabox-release/incoming \
  /srv/ideabox-release/archive \
  /srv/ideabox-release/failed \
  /srv/ideabox-release/logs \
  /srv/ideabox-release/locks

install -o root -g root -m 0644 "${SOURCE_DIR}/release.config.json" /opt/ideabox-release/lib/release.config.json
install -o root -g root -m 0644 "${SOURCE_DIR}/release-config.mjs" /opt/ideabox-release/lib/release-config.mjs
install -o root -g root -m 0644 "${SOURCE_DIR}/release.mjs" /opt/ideabox-release/lib/release.mjs
install -o root -g root -m 0644 "${SOURCE_DIR}/server/publish-release.mjs" /opt/ideabox-release/lib/server/publish-release.mjs
install -o root -g root -m 0755 "${SOURCE_DIR}/server/release-server.sh" /opt/ideabox-release/bin/release-server
install -o root -g root -m 0750 "${SOURCE_DIR}/server/configure-ossutil-credential.sh" /opt/ideabox-release/bin/configure-ossutil-credential

install -d -o ideabox-release -g ideabox-release -m 0700 /home/ideabox-release/.ssh
touch /home/ideabox-release/.ssh/authorized_keys
chown ideabox-release:ideabox-release /home/ideabox-release/.ssh/authorized_keys
chmod 0600 /home/ideabox-release/.ssh/authorized_keys
if ! grep -Fqx -- "$(cat "${PUBLIC_KEY_FILE}")" /home/ideabox-release/.ssh/authorized_keys; then
  cat "${PUBLIC_KEY_FILE}" >> /home/ideabox-release/.ssh/authorized_keys
fi

printf '[bootstrap] Dedicated user and isolated directories are installed.\n'
printf '[bootstrap] Website directory was not modified.\n'
printf '[bootstrap] node=' 
if command -v node >/dev/null 2>&1; then node --version; else printf 'missing\n'; fi
printf '[bootstrap] ossutil=' 
if command -v ossutil >/dev/null 2>&1; then
  if ossutil_version="$(ossutil version 2>&1)"; then
    printf '%s\n' "${ossutil_version}"
  elif ossutil_version="$(ossutil --version 2>&1)"; then
    printf '%s\n' "${ossutil_version}"
  else
    printf 'installed-but-version-unavailable\n'
  fi
else
  printf 'missing\n'
fi
printf '[bootstrap] credential_config=' 
if [[ -s /etc/ideabox-release/ossutilconfig ]]; then
  stat -c '%A %U:%G %n' /etc/ideabox-release/ossutilconfig
else
  printf 'unconfigured (configure interactively after bootstrap)\n'
fi
