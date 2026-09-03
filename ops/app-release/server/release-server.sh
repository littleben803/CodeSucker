#!/usr/bin/env bash
set -euo pipefail

INCOMING_BASE="${IDEABOX_RELEASE_INCOMING:-/srv/ideabox-release/incoming}"
LOCKS_BASE="${IDEABOX_RELEASE_LOCKS:-/srv/ideabox-release/locks}"
SERVER_LIB="${IDEABOX_RELEASE_LIB:-/opt/ideabox-release/lib}"
NODE_BIN="${IDEABOX_NODE_BIN:-/usr/local/bin/node}"
OSSUTIL_CONFIG_FILE="${OSSUTIL_CONFIG_FILE:-/etc/ideabox-release/ossutilconfig}"
OSSUTIL_PROFILE="${OSSUTIL_PROFILE:-release}"

release_dir=""
previous=""
for argument in "$@"; do
  if [[ "${previous}" == "--release-dir" ]]; then
    release_dir="${argument}"
    break
  fi
  previous="${argument}"
done

if [[ -z "${release_dir}" ]]; then
  printf 'ERROR: --release-dir is required\n' >&2
  exit 2
fi

resolved_release_dir="$(realpath -e -- "${release_dir}")"
case "${resolved_release_dir}" in
  "${INCOMING_BASE}"/*) ;;
  *) printf 'ERROR: release directory must be below %s\n' "${INCOMING_BASE}" >&2; exit 2 ;;
esac

lock_id="$(printf '%s' "${resolved_release_dir}" | sha256sum | cut -d' ' -f1)"
lock_file="${LOCKS_BASE}/${lock_id}.lock"

exec flock -n -E 75 "${lock_file}" \
  env \
    OSSUTIL_CONFIG_FILE="${OSSUTIL_CONFIG_FILE}" \
    OSSUTIL_PROFILE="${OSSUTIL_PROFILE}" \
    "${NODE_BIN}" "${SERVER_LIB}/server/publish-release.mjs" "$@"
