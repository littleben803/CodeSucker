#!/usr/bin/env bash
set -euo pipefail

SERVER="${IDEABOX_BOOTSTRAP_SERVER:-root@47.98.192.155}"
VERSION="2.4.0"
EXECUTE=no
CONFIRM=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --execute) EXECUTE=yes; shift ;;
    --confirm) CONFIRM="${2:-}"; shift 2 ;;
    *) printf 'ERROR: unsupported argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

expected="upgrade-ossutil:${VERSION}"
if [[ "${EXECUTE}" != yes ]]; then
  printf 'DRY RUN: would upgrade ossutil on %s to %s\n' "${SERVER}" "${VERSION}"
  printf 'The existing binary would be backed up under /opt/ideabox-release/backups/.\n'
  printf 'No ossutil configuration file or OSS object would be changed.\n'
  printf 'Execute with: --execute --confirm %s\n' "${expected}"
  exit 0
fi
if [[ "${CONFIRM}" != "${expected}" ]]; then
  printf 'ERROR: upgrade requires --confirm %s\n' "${expected}" >&2
  exit 2
fi

printf '[upgrade] Server: %s\n' "${SERVER}"
ssh "${SERVER}" "TARGET_VERSION='${VERSION}' bash -s" <<'REMOTE'
set -euo pipefail

case "$(uname -m)" in
  x86_64|amd64)
    package_arch='linux-amd64'
    expected_sha256='85edf66b2fb7238f5c7e25cab820cf29312319fe4935b7c86a6b8485eb434f3c'
    ;;
  aarch64|arm64)
    package_arch='linux-arm64'
    expected_sha256='7767240e9667d1f26fbe4e04f90b796b4356889e77d0076cc8a543c8ce081987'
    ;;
  *)
    printf 'ERROR: unsupported server architecture: %s\n' "$(uname -m)" >&2
    exit 2
    ;;
esac

for dependency in curl unzip sha256sum; do
  if ! command -v "${dependency}" >/dev/null 2>&1; then
    printf 'ERROR: required command is missing: %s\n' "${dependency}" >&2
    exit 2
  fi
done

current_binary="$(command -v ossutil || true)"
case "${current_binary}" in
  /usr/bin/ossutil|/usr/local/bin/ossutil) ;;
  '') printf 'ERROR: current ossutil binary is missing\n' >&2; exit 2 ;;
  *) printf 'ERROR: refusing to replace unexpected ossutil path: %s\n' "${current_binary}" >&2; exit 2 ;;
esac

if current_output="$(ossutil version 2>&1)"; then
  :
elif current_output="$(ossutil --version 2>&1)"; then
  :
else
  printf 'ERROR: cannot determine current ossutil version\n' >&2
  exit 2
fi
printf '[remote] current=%s path=%s arch=%s\n' "${current_output}" "${current_binary}" "${package_arch}"
if printf '%s' "${current_output}" | grep -Eq "(^|[^0-9])${TARGET_VERSION}([^0-9]|$)"; then
  printf '[remote] ossutil %s is already installed; no replacement required.\n' "${TARGET_VERSION}"
  exit 0
fi

work_dir="$(mktemp -d /tmp/ideabox-ossutil-upgrade.XXXXXX)"
cleanup() {
  case "${work_dir}" in
    /tmp/ideabox-ossutil-upgrade.*) rm -rf -- "${work_dir}" ;;
  esac
}
trap cleanup EXIT

package_name="ossutil-${TARGET_VERSION}-${package_arch}.zip"
package_path="${work_dir}/${package_name}"
download_url="https://gosspublic.alicdn.com/ossutil/v2/${TARGET_VERSION}/${package_name}"
printf '[remote] downloading=%s\n' "${download_url}"
curl --fail --location --proto '=https' --tlsv1.2 --output "${package_path}" "${download_url}"
printf '%s  %s\n' "${expected_sha256}" "${package_path}" | sha256sum --check --status
printf '[remote] sha256=verified\n'

unzip -q "${package_path}" -d "${work_dir}/extracted"
candidate="$(find "${work_dir}/extracted" -type f -name ossutil -perm -u+x -print -quit)"
if [[ -z "${candidate}" ]]; then
  printf 'ERROR: verified archive does not contain an executable ossutil binary\n' >&2
  exit 2
fi
candidate_version="$(${candidate} version)"
if ! printf '%s' "${candidate_version}" | grep -Eq "(^|[^0-9])${TARGET_VERSION}([^0-9]|$)"; then
  printf 'ERROR: downloaded binary version mismatch: %s\n' "${candidate_version}" >&2
  exit 2
fi

install -d -o root -g root -m 0755 /opt/ideabox-release/backups
backup_path="/opt/ideabox-release/backups/ossutil-v1-before-${TARGET_VERSION}-${package_arch}"
if [[ ! -e "${backup_path}" ]]; then
  install -o root -g root -m 0755 "${current_binary}" "${backup_path}"
fi
install -o root -g root -m 0755 "${candidate}" "${current_binary}.new"
mv -f -- "${current_binary}.new" "${current_binary}"
hash -r

installed_version="$(ossutil version)"
if ! printf '%s' "${installed_version}" | grep -Eq "(^|[^0-9])${TARGET_VERSION}([^0-9]|$)" \
  || ! ossutil stat --help | grep -q -- '--profile'; then
  install -o root -g root -m 0755 "${backup_path}" "${current_binary}"
  printf 'ERROR: post-install verification failed; previous binary restored\n' >&2
  exit 2
fi
printf '[remote] installed=%s\n' "${installed_version}"
printf '[remote] backup=%s\n' "${backup_path}"
REMOTE

curl -fsS --max-time 10 -o /dev/null -w '[upgrade] website_http=%{http_code}\n' https://www.ideaboxapps.com
printf '[upgrade] Completed. Re-run audit-server.sh for the full server baseline.\n'
