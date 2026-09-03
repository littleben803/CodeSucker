#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SERVER="${IDEABOX_BOOTSTRAP_SERVER:-root@47.98.192.155}"
PUBLIC_KEY="${IDEABOX_RELEASE_PUBLIC_KEY:-${HOME}/.ssh/id_ed25519.pub}"
CONFIRM=""
EXECUTE=no

while [[ $# -gt 0 ]]; do
  case "$1" in
    --execute) EXECUTE=yes; shift ;;
    --confirm) CONFIRM="${2:-}"; shift 2 ;;
    *) printf 'ERROR: unsupported argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

expected="bootstrap:47.98.192.155"
if [[ "${EXECUTE}" != yes ]]; then
  printf 'DRY RUN: would install release tools on %s\n' "${SERVER}"
  printf 'Dedicated paths: /opt/ideabox-release, /etc/ideabox-release, /srv/ideabox-release\n'
  printf 'Website path /var/www/ideaboxapps is outside the deployment scope.\n'
  printf 'Execute with: --execute --confirm %s\n' "${expected}"
  exit 0
fi
if [[ "${CONFIRM}" != "${expected}" ]]; then
  printf 'ERROR: deployment requires --confirm %s\n' "${expected}" >&2
  exit 2
fi
if [[ ! -f "${PUBLIC_KEY}" ]]; then
  printf 'ERROR: SSH public key not found: %s\n' "${PUBLIC_KEY}" >&2
  exit 2
fi

package_dir="$(mktemp -d)"
remote_package="/tmp/ideabox-release-bootstrap-$$.tar.gz"
cleanup() {
  rm -rf "${package_dir}"
}
trap cleanup EXIT

install -d "${package_dir}/server"
install -m 0644 "${ROOT_DIR}/ops/app-release/release.config.json" "${package_dir}/release.config.json"
install -m 0644 "${ROOT_DIR}/ops/app-release/release-config.mjs" "${package_dir}/release-config.mjs"
install -m 0644 "${ROOT_DIR}/ops/app-release/release.mjs" "${package_dir}/release.mjs"
install -m 0644 "${ROOT_DIR}/ops/app-release/server/publish-release.mjs" "${package_dir}/server/publish-release.mjs"
install -m 0755 "${ROOT_DIR}/ops/app-release/server/release-server.sh" "${package_dir}/server/release-server.sh"
install -m 0755 "${ROOT_DIR}/ops/app-release/server/bootstrap-server.sh" "${package_dir}/server/bootstrap-server.sh"
install -m 0755 "${ROOT_DIR}/ops/app-release/server/configure-ossutil-credential.sh" "${package_dir}/server/configure-ossutil-credential.sh"
install -m 0644 "${PUBLIC_KEY}" "${package_dir}/release_authorized_key.pub"
COPYFILE_DISABLE=1 tar --no-xattrs -C "${package_dir}" -czf "${package_dir}/bootstrap.tar.gz" \
  release.config.json release-config.mjs release.mjs release_authorized_key.pub server

printf '[deploy] Uploading audited bootstrap package to %s\n' "${SERVER}"
scp "${package_dir}/bootstrap.tar.gz" "${SERVER}:${remote_package}"
ssh "${SERVER}" "REMOTE_PACKAGE='${remote_package}' bash -s" <<'REMOTE'
set -euo pipefail
work_dir="$(mktemp -d)"
cleanup() {
  rm -rf "${work_dir}" "${REMOTE_PACKAGE}"
}
trap cleanup EXIT
tar -xzf "${REMOTE_PACKAGE}" -C "${work_dir}"
bash "${work_dir}/server/bootstrap-server.sh" "${work_dir}"
REMOTE

printf '[deploy] Server tools installed. Run audit-server.sh to verify.\n'
