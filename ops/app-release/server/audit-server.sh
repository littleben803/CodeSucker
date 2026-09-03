#!/usr/bin/env bash
set -euo pipefail

SERVER="${IDEABOX_BOOTSTRAP_SERVER:-root@47.98.192.155}"
SSH_OPTIONS=(-o ConnectTimeout=10)
if [[ "${IDEABOX_SSH_BATCH_MODE:-no}" == "yes" ]]; then
  SSH_OPTIONS+=(-o BatchMode=yes)
fi

printf '[audit] Server: %s\n' "${SERVER}"
ssh "${SSH_OPTIONS[@]}" "${SERVER}" 'set -eu
printf "os="
. /etc/os-release
printf "%s %s\n" "$ID" "$VERSION_ID"
printf "current_identity="
id
printf "release_user="
getent passwd ideabox-release || printf "missing\n"
printf "node="
if command -v node >/dev/null 2>&1; then node --version; else printf "missing\n"; fi
printf "ossutil="
if command -v ossutil >/dev/null 2>&1; then
  if ossutil_version="$(ossutil version 2>&1)"; then
    printf "%s\n" "$ossutil_version"
  elif ossutil_version="$(ossutil --version 2>&1)"; then
    printf "%s\n" "$ossutil_version"
  else
    printf "installed-but-version-unavailable\n"
  fi
else
  printf "missing\n"
fi
printf "rsync="
if command -v rsync >/dev/null 2>&1; then rsync --version | sed -n "1p"; else printf "missing\n"; fi
printf "flock="
if command -v flock >/dev/null 2>&1; then command -v flock; else printf "missing\n"; fi
for path in /opt/ideabox-release /etc/ideabox-release /srv/ideabox-release /var/www/ideaboxapps; do
  if [ -e "$path" ]; then stat -c "%A %U:%G %n" "$path"; else printf "missing %s\n" "$path"; fi
done
if [ -f /etc/ideabox-release/ossutilconfig ]; then
  stat -c "%A %U:%G %n" /etc/ideabox-release/ossutilconfig
else
  printf "missing /etc/ideabox-release/ossutilconfig\n"
fi
printf "nginx="
systemctl is-active nginx 2>/dev/null || true
df -h / /srv /opt 2>/dev/null || df -h /
'

curl -fsS --max-time 10 -o /dev/null -w '[audit] website_http=%{http_code}\n' https://www.ideaboxapps.com
