#!/usr/bin/env bash
set -euo pipefail

SERVER="${IDEABOX_BOOTSTRAP_SERVER:-root@47.98.192.155}"
EXECUTE=no
CONFIRM=''

while [[ $# -gt 0 ]]; do
  case "$1" in
    --execute) EXECUTE=yes; shift ;;
    --confirm) CONFIRM="${2:-}"; shift 2 ;;
    *) printf 'ERROR: unsupported argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

expected='configure-ossutil:release'
if [[ "${EXECUTE}" != yes ]]; then
  printf 'DRY RUN: would open the protected credential wizard on %s\n' "${SERVER}"
  printf 'The command does not accept credentials as arguments and performs no OSS request.\n'
  printf 'Execute with: --execute --confirm %s\n' "${expected}"
  exit 0
fi
if [[ "${CONFIRM}" != "${expected}" ]]; then
  printf 'ERROR: configuration requires --confirm %s\n' "${expected}" >&2
  exit 2
fi

ssh -t "${SERVER}" /opt/ideabox-release/bin/configure-ossutil-credential
