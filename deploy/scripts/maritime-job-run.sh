#!/usr/bin/env bash
# Pemanggil job terjadwal Maritim Suite — PRD-002 Step 3.
#
# Dipanggil unit systemd (deploy/systemd/maritime-reminders.service):
#   maritime-job-run.sh <job>        contoh: maritime-job-run.sh reminders
#
# Kontrak keluar (dibaca systemd; unit gagal = terlihat di `systemctl --failed`):
#   0   HTTP 200 dan respons membawa "ok":true
#   1   HTTP bukan 200, ATAU "ok" bukan true (sebagian tenant/notifikasi gagal)
#   64  argumen salah
#   75  aplikasi tak terjangkau (curl gagal)
#   78  token tidak terbaca
#
# Token: $CREDENTIALS_DIRECTORY/job-token (LoadCredential systemd), atau
# $JOB_TOKEN_FILE. Dikirim lewat STDIN curl (`-H @-`), jadi tidak pernah muncul
# di argumen proses, di log, atau di journal. Berkas ini tak memuat rahasia apa pun.
#
# Tumpang-tindih: unit oneshot tak pernah berjalan dua kali bersamaan; panggilan
# lain yang kebetulan bersamaan (tombol Settings) aman karena setiap notifikasi
# dijaga @@unique([tenantId, dedupeKey]) di database (K101).

set -euo pipefail

JOB="${1:-}"
log() { printf '%s [maritime-job-run] job=%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${JOB:-?}" "$*"; }

if [[ -z "$JOB" || ! "$JOB" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  log "GAGAL argumen: pakai maritime-job-run.sh <job> (huruf kecil/angka, boleh tanda hubung setelahnya)"
  exit 64
fi

BASE_URL="${JOB_BASE_URL:-http://127.0.0.1:3001}"

if [[ -n "${CREDENTIALS_DIRECTORY:-}" && -r "${CREDENTIALS_DIRECTORY}/job-token" ]]; then
  TOKEN_FILE="${CREDENTIALS_DIRECTORY}/job-token"
else
  TOKEN_FILE="${JOB_TOKEN_FILE:-/etc/tribuana/job-runner-token}"
fi
if [[ ! -r "$TOKEN_FILE" ]]; then
  log "GAGAL token tidak terbaca (LoadCredential / JOB_TOKEN_FILE)"
  exit 78
fi
TOKEN="$(tr -d '\r\n' < "$TOKEN_FILE")"

BODY="$(mktemp)"
trap 'rm -f "$BODY"' EXIT

set +e
KODE="$(printf 'x-job-token: %s\n' "$TOKEN" | curl -sS -o "$BODY" -w '%{http_code}' \
  --max-time "${JOB_MAX_TIME:-300}" -X POST -H @- "$BASE_URL/api/jobs/run?job=$JOB" 2>/dev/null)"
RC=$?
set -e

if [[ $RC -ne 0 ]]; then
  log "GAGAL aplikasi tak terjangkau (curl exit=$RC)"
  exit 75
fi

TOTAL="$(grep -o '"total":{[^}]*}' "$BODY" || true)"

if [[ "$KODE" != "200" ]]; then
  log "GAGAL http=$KODE"
  exit 1
fi
if grep -q '"ok":true' "$BODY"; then
  log "OK http=200 ${TOTAL}"
  exit 0
fi
log "GAGAL SEBAGIAN http=200 ok!=true ${TOTAL}"
exit 1
