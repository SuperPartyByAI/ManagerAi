#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="/opt/superparty-portal"
SERVICE_NAME="superparty-portal.service"
OLD_CHUNK_NAME="page-34951323b289cb97.js"
NEW_CHUNK_NAME="page-r53perf-1c1c2527.js"
EXPECTED_OLD_SHA256="5c876b8f02e47e56151e20dc842f177e158eb52edb14bd6178ae11144922a343"
EXPECTED_NEW_SHA256="1c1c2527c9d8aa2cf4384f653e5faa8680a87f19fe3a3148f94ba8993e76ad03"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_ROOT="/opt/superparty-backups/r14.4-performance-${STAMP}"
OLD_CHUNK_PATH="${APP_ROOT}/.next/static/chunks/app/wowparty/${OLD_CHUNK_NAME}"
NEW_CHUNK_PATH="${APP_ROOT}/.next/static/chunks/app/wowparty/${NEW_CHUNK_NAME}"
REPLACED=0

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  restore_backup
  exit 1
}

restore_backup() {
  if [[ "${REPLACED}" -eq 1 && -d "${BACKUP_ROOT}/root" ]]; then
    cp -a "${BACKUP_ROOT}/root/." "${APP_ROOT}/"
    systemctl restart "${SERVICE_NAME}" || true
    REPLACED=0
  fi
}

trap 'restore_backup' ERR

[[ "$(id -u)" -eq 0 ]] || fail "Rulează scriptul ca root."
[[ -d "${APP_ROOT}/.next" ]] || fail "Buildul live nu există în ${APP_ROOT}/.next."
[[ -f "${OLD_CHUNK_PATH}" ]] || fail "Chunkul live așteptat nu există: ${OLD_CHUNK_PATH}."

CURRENT_SHA256="$(sha256sum "${OLD_CHUNK_PATH}" | awk '{print $1}')"
if [[ -f "${NEW_CHUNK_PATH}" ]] && [[ "$(sha256sum "${NEW_CHUNK_PATH}" | awk '{print $1}')" == "${EXPECTED_NEW_SHA256}" ]]; then
  printf 'Hotfixul este deja instalat și valid.\n'
  exit 0
fi
[[ "${CURRENT_SHA256}" == "${EXPECTED_OLD_SHA256}" ]] || fail "Buildul live s-a schimbat; hotfixul nu va modifica o versiune necunoscută."

mapfile -d '' MANIFEST_FILES < <(grep -RIlZ --fixed-strings "${OLD_CHUNK_NAME}" "${APP_ROOT}/.next")
[[ "${#MANIFEST_FILES[@]}" -gt 0 ]] || fail "Nu am găsit manifestele care referă chunkul live."

mkdir -p "${BACKUP_ROOT}/root"
for SOURCE_PATH in "${MANIFEST_FILES[@]}" "${OLD_CHUNK_PATH}"; do
  RELATIVE_PATH="${SOURCE_PATH#${APP_ROOT}/}"
  mkdir -p "${BACKUP_ROOT}/root/$(dirname "${RELATIVE_PATH}")"
  cp -a "${SOURCE_PATH}" "${BACKUP_ROOT}/root/${RELATIVE_PATH}"
done

cp "${OLD_CHUNK_PATH}" "${NEW_CHUNK_PATH}.new"
perl -0pi -e 's/let h=await Promise\.allSettled\(\[tH\(u,0,1\),/let g0=await tH(u,0,1);ek(k(g0.conversations||[]));let h=await Promise.allSettled([Promise.resolve(g0),/' "${NEW_CHUNK_PATH}.new"
perl -0pi -e 's/sv\.map\(e=>\{/sv.slice(0,150).map(e=>{/' "${NEW_CHUNK_PATH}.new"
perl -0pi -e 's/window\.setInterval\(e,3e4\)/window.setInterval(e,3e5)/' "${NEW_CHUNK_PATH}.new"
perl -0pi -e 's/window\.setInterval\(\(\)=>void e\(\),1e4\)/window.setInterval(()=>void e(),2e4)/' "${NEW_CHUNK_PATH}.new"
[[ "$(sha256sum "${NEW_CHUNK_PATH}.new" | awk '{print $1}')" == "${EXPECTED_NEW_SHA256}" ]] || fail "Transformarea locală nu a produs hashul auditat."
node --check "${NEW_CHUNK_PATH}.new"
chmod --reference="${OLD_CHUNK_PATH}" "${NEW_CHUNK_PATH}.new"
chown --reference="${OLD_CHUNK_PATH}" "${NEW_CHUNK_PATH}.new"
mv "${NEW_CHUNK_PATH}.new" "${NEW_CHUNK_PATH}"

export OLD_CHUNK_NAME NEW_CHUNK_NAME
perl -0pi -e 's/\Q$ENV{OLD_CHUNK_NAME}\E/$ENV{NEW_CHUNK_NAME}/g' "${MANIFEST_FILES[@]}"
REPLACED=1

systemctl restart "${SERVICE_NAME}"
for _ in {1..25}; do
  if systemctl is-active --quiet "${SERVICE_NAME}"; then
    break
  fi
  sleep 1
done
systemctl is-active --quiet "${SERVICE_NAME}" || fail "Serviciul nu a revenit activ după restart."

LIVE_HTML="$(curl -fsS --max-time 20 "https://app.superparty.ro/wowparty?view=chat&hotfix=${STAMP}")"
grep -Fq "${NEW_CHUNK_NAME}" <<<"${LIVE_HTML}" || fail "Pagina live nu publică încă noul chunk."

REPLACED=0
printf 'STATUS=SUCCESS\n'
printf 'BACKUP=%s\n' "${BACKUP_ROOT}"
printf 'CHUNK=%s\n' "${NEW_CHUNK_NAME}"
