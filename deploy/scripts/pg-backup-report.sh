#!/usr/bin/env bash
# Pelapor hasil backup PostgreSQL ke Maritim Suite — PRD-002 Step 3 (K186).
#
# Dipanggil systemd SESUDAH pg-backup.service selesai, lewat drop-in
# deploy/systemd/pg-backup.service.d/10-lapor-status.conf:
#   OnSuccess=pg-backup-report@ok.service     → pg-backup-report.sh ok
#   OnFailure=pg-backup-report@gagal.service  → pg-backup-report.sh gagal
#
# Kenapa unit TERPISAH, bukan menyunting /usr/local/sbin/pg-backup.sh: skrip itu
# sudah terbukti berjalan di produksi, dan pelaporan yang ikut di dalamnya bisa
# membuat backup yang sukses tercatat gagal (set -e + curl). Di sini, apa pun
# yang terjadi pada pelaporan, hasil pg-backup.service TIDAK berubah.
#
# "ok" dari systemd belum cukup untuk kartu hijau: skrip ini MEMBUKTIKAN
# artefaknya dulu — berkas terbaru ada, cukup baru, cukup besar, dan isinya bisa
# dibaca (gzip -t / pg_restore --list). Gagal salah satunya → dilaporkan GAGAL.
#
# Konfigurasi (EnvironmentFile /etc/tribuana/pg-backup-report.env — tanpa rahasia):
#   BACKUP_DIR       direktori artefak yang dicek (WAJIB untuk status ok)
#   BACKUP_GLOB      pola nama berkas (bawaan: *)
#   MAX_AGE_HOURS    umur maksimum artefak terbaru (bawaan: 26)
#   MIN_BYTES        ukuran minimum artefak terbaru (bawaan: 1024)
#   RETENTION_DAYS   bila diisi: PERINGATAN bila ada berkas lebih tua dari ini.
#                    Skrip ini TIDAK PERNAH menghapus apa pun — retensi milik pg-backup.sh.
#   JOB_BASE_URL     bawaan http://127.0.0.1:3001 (loopback, tak lewat nginx)
#   JOB_TOKEN_FILE   dipakai bila $CREDENTIALS_DIRECTORY/job-token tidak ada
#
# Kontrak keluar:
#   0   artefak valid & dilaporkan; ATAU status "gagal" dilaporkan; ATAU hook
#       pelaporan belum dikonfigurasi (PERINGATAN — pelaporan bersifat OPSIONAL)
#   1   artefak tidak valid (dilaporkan GAGAL bila hook tersedia)
#   2   laporan tidak terkirim (backup-nya sendiri TIDAK dianggap gagal karena ini)
#   64  argumen salah
#
# Token dikirim lewat STDIN curl (`-H @-`), bukan argumen proses; tak pernah dicetak.

set -uo pipefail

STATUS="${1:-}"
log() { printf '%s [pg-backup-report] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

case "$STATUS" in
  ok|gagal) ;;
  *) log "GAGAL argumen: pakai pg-backup-report.sh ok|gagal"; exit 64 ;;
esac

BACKUP_DIR="${BACKUP_DIR:-}"
BACKUP_GLOB="${BACKUP_GLOB:-*}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-26}"
MIN_BYTES="${MIN_BYTES:-1024}"
RETENTION_DAYS="${RETENTION_DAYS:-}"
BASE_URL="${JOB_BASE_URL:-http://127.0.0.1:3001}"
SEKARANG="${NOW_EPOCH:-$(date +%s)}"

# Isi artefak bisa dibaca? Format tak dikenal / alat tak ada = PERINGATAN, bukan gagal.
periksa_isi() {
  local f="$1"
  case "$f" in
    *.gz) gzip -t "$f" 2>/dev/null ;;
    *.dump|*.backup|*.pgdump)
      if command -v pg_restore >/dev/null 2>&1; then
        pg_restore --list "$f" >/dev/null 2>&1
      else
        log "PERINGATAN pg_restore tidak ada; isi $(basename -- "$f") tidak diverifikasi"
      fi ;;
    *) log "PERINGATAN format $(basename -- "$f") tidak dikenal; isi tidak diverifikasi" ;;
  esac
}

BERHASIL=false
UKURAN=0
KODE=0
TERBARU=""

if [[ "$STATUS" == "gagal" ]]; then
  PESAN="pg-backup.service gagal"
elif [[ -z "$BACKUP_DIR" || ! -d "$BACKUP_DIR" ]]; then
  PESAN="direktori backup tidak ditemukan"
  KODE=1
else
  TERBARU="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "$BACKUP_GLOB" -printf '%T@ %p\n' 2>/dev/null \
    | sort -n | tail -n 1 | cut -d' ' -f2-)"
  if [[ -z "$TERBARU" ]]; then
    PESAN="artefak backup tidak ada"
    KODE=1
  else
    MTIME="$(stat -c %Y -- "$TERBARU")"
    BYTES="$(stat -c %s -- "$TERBARU")"
    UMUR=$(( SEKARANG - MTIME ))
    if (( UMUR > MAX_AGE_HOURS * 3600 )); then
      PESAN="artefak terbaru terlalu tua ($(( UMUR / 3600 )) jam)"
      KODE=1
    elif (( BYTES < MIN_BYTES )); then
      PESAN="artefak terbaru terlalu kecil (${BYTES} byte)"
      KODE=1
    elif ! periksa_isi "$TERBARU"; then
      PESAN="artefak terbaru rusak atau tak terbaca"
      KODE=1
    else
      BERHASIL=true
      UKURAN="$BYTES"
      PESAN="artefak valid"
    fi
  fi

  if [[ -n "$RETENTION_DAYS" ]]; then
    LAMA="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "$BACKUP_GLOB" -mtime "+$RETENTION_DAYS" 2>/dev/null | wc -l | tr -d ' ')"
    if (( LAMA > 0 )); then
      log "PERINGATAN retensi: $LAMA berkas lebih tua dari $RETENTION_DAYS hari (tidak dihapus)"
    fi
  fi
fi

if [[ "$BERHASIL" == true ]]; then
  log "artefak valid: $(basename -- "$TERBARU") ${UKURAN} byte"
elif [[ "$STATUS" == "gagal" ]]; then
  log "BACKUP GAGAL: $PESAN"
else
  log "BACKUP TIDAK SEHAT: $PESAN"
fi

# ------------------------------------------------------------------ pelaporan

if [[ -n "${CREDENTIALS_DIRECTORY:-}" && -r "${CREDENTIALS_DIRECTORY}/job-token" ]]; then
  TOKEN_FILE="${CREDENTIALS_DIRECTORY}/job-token"
else
  TOKEN_FILE="${JOB_TOKEN_FILE:-/etc/tribuana/job-runner-token}"
fi
if [[ ! -r "$TOKEN_FILE" ]]; then
  log "PERINGATAN hook pelaporan belum dikonfigurasi (token tak terbaca) — hasil tidak dilaporkan ke aplikasi"
  exit "$KODE"
fi
TOKEN="$(tr -d '\r\n' < "$TOKEN_FILE")"

BODY="$(mktemp)"
trap 'rm -f "$BODY"' EXIT

HTTP="$(printf 'x-job-token: %s\n' "$TOKEN" | curl -sS -o "$BODY" -w '%{http_code}' \
  --max-time "${REPORT_MAX_TIME:-10}" --retry "${REPORT_RETRY:-3}" --retry-delay 5 \
  -G -X POST -H @- \
  --data-urlencode "job=backup-status" \
  --data-urlencode "berhasil=$BERHASIL" \
  --data-urlencode "ukuranBytes=$UKURAN" \
  --data-urlencode "pesan=$PESAN" \
  "$BASE_URL/api/jobs/run" 2>/dev/null)"
RC=$?

if [[ $RC -ne 0 || "$HTTP" != "200" ]]; then
  log "GAGAL melaporkan ke aplikasi (http=${HTTP:-000} curl=$RC) — backup TIDAK dianggap gagal karena ini"
  (( KODE != 0 )) && exit "$KODE"
  exit 2
fi

log "dilaporkan ke aplikasi: berhasil=$BERHASIL"
exit "$KODE"
