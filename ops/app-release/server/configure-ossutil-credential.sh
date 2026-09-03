#!/usr/bin/env bash
set -euo pipefail

CONFIG_DIR='/etc/ideabox-release'
CONFIG_FILE='/etc/ideabox-release/ossutilconfig'
RELEASE_USER='ideabox-release'
PROFILE='release'
REGION='cn-hangzhou'
ENDPOINT='oss-cn-hangzhou.aliyuncs.com'
TTY_STATE=''

if [[ "$(id -u)" -ne 0 ]]; then
  printf 'ERROR: configure-ossutil-credential must run as root\n' >&2
  exit 2
fi
if ! getent passwd "${RELEASE_USER}" >/dev/null; then
  printf 'ERROR: release user is missing: %s\n' "${RELEASE_USER}" >&2
  exit 2
fi

cleanup() {
  if [[ -n "${TTY_STATE}" ]]; then
    stty "${TTY_STATE}" 2>/dev/null || true
  fi
  chown root:"${RELEASE_USER}" "${CONFIG_DIR}" 2>/dev/null || true
  chmod 0750 "${CONFIG_DIR}" 2>/dev/null || true
  if [[ -e "${CONFIG_FILE}" ]]; then
    chown "${RELEASE_USER}:${RELEASE_USER}" "${CONFIG_FILE}" 2>/dev/null || true
    chmod 0600 "${CONFIG_FILE}" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

install -d -o root -g "${RELEASE_USER}" -m 0770 "${CONFIG_DIR}"
if [[ ! -e "${CONFIG_FILE}" ]]; then
  install -o "${RELEASE_USER}" -g "${RELEASE_USER}" -m 0600 /dev/null "${CONFIG_FILE}"
fi
chown "${RELEASE_USER}:${RELEASE_USER}" "${CONFIG_FILE}"
chmod 0600 "${CONFIG_FILE}"

if [[ -t 0 ]]; then
  TTY_STATE="$(stty -g)"
  stty -echo
fi

printf '[credential] Terminal input echo is disabled for the credential wizard.\n'
printf '[credential] Choose AK mode and encrypted storage. Type normally and press Return after each answer.\n'
sudo -u "${RELEASE_USER}" -H \
  ossutil config credential \
  --config-file "${CONFIG_FILE}" \
  --profile "${PROFILE}"

sudo -u "${RELEASE_USER}" -H \
  ossutil config set region "${REGION}" \
  --config-file "${CONFIG_FILE}" \
  --profile "${PROFILE}"
sudo -u "${RELEASE_USER}" -H \
  ossutil config set endpoint "${ENDPOINT}" \
  --config-file "${CONFIG_FILE}" \
  --profile "${PROFILE}"

if [[ ! -s "${CONFIG_FILE}" ]]; then
  printf 'ERROR: credential configuration did not produce a non-empty config file\n' >&2
  exit 2
fi
sudo -u "${RELEASE_USER}" -H \
  ossutil config list-profiles \
  --config-file "${CONFIG_FILE}" \
  | grep -qx "${PROFILE}"

printf '[credential] Profile, region, and endpoint were saved. No OSS request was performed.\n'
