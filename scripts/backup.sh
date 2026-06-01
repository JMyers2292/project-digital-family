#!/usr/bin/env bash
# Nightly backup — invoked by systemd timer at 2am.
# Backs up the vault and state.db to an encrypted Google Drive remote via rclone.
#
# Prerequisites (one-time manual setup on the Pi):
#   1. Install rclone: https://rclone.org/install/
#   2. Configure an encrypted remote:
#        rclone config
#        # Create remote named "gdrive-raw" (Google Drive, follow OAuth prompts)
#        # Create remote named "gdrive" (crypt, remote=gdrive-raw:digital-parent-backups,
#        #   password=<strong passphrase>, directory_name_encryption=true)
#   3. Set RCLONE_REMOTE in /opt/digital-parent/bot/.env (default: gdrive)
#
# Retention (enforced by --backup-dir + --min-age):
#   Daily snapshots kept for 30 days, monthly snapshots kept for 12 months.
#   rclone sync keeps the latest copy in the primary path; older versions are
#   moved to dated backup dirs so they can be pruned independently.
#
# Restore:
#   rclone sync gdrive:vault /opt/digital-parent/vault
#   rclone copy gdrive:data/state.db /opt/digital-parent/data/state.db

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ENV_FILE="$PROJECT_ROOT/bot/.env"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

: "${RCLONE_BIN:=rclone}"
: "${RCLONE_REMOTE:=gdrive}"
: "${VAULT_PATH:=$PROJECT_ROOT/vault}"
: "${DATA_PATH:=$PROJECT_ROOT/data}"

LOG_PREFIX="[backup]"

log() { echo "$LOG_PREFIX $*"; }
die() { echo "$LOG_PREFIX ERROR: $*" >&2; exit 1; }

# Verify rclone is available.
if ! command -v "$RCLONE_BIN" &>/dev/null; then
  die "rclone not found — install it and re-run (see script header for instructions)"
fi

# Verify the remote is configured.
if ! "$RCLONE_BIN" listremotes 2>/dev/null | grep -q "^${RCLONE_REMOTE}:"; then
  die "rclone remote '${RCLONE_REMOTE}' not configured — run 'rclone config' (see script header)"
fi

DATE=$(date +%Y-%m-%d)
MONTH=$(date +%Y-%m)

log "starting backup for $DATE..."

# ---- Vault ----
log "syncing vault to ${RCLONE_REMOTE}:vault"
"$RCLONE_BIN" sync \
  "$VAULT_PATH" \
  "${RCLONE_REMOTE}:vault" \
  --backup-dir "${RCLONE_REMOTE}:vault-history/${DATE}" \
  --exclude ".git/**" \
  --log-level INFO

# ---- State DB ----
if [[ -f "$DATA_PATH/state.db" ]]; then
  log "copying state.db to ${RCLONE_REMOTE}:data"
  "$RCLONE_BIN" copy \
    "$DATA_PATH/state.db" \
    "${RCLONE_REMOTE}:data" \
    --log-level INFO
else
  log "state.db not found — skipping DB backup"
fi

# ---- Retention: prune daily history older than 30 days ----
log "pruning daily history older than 30 days..."
"$RCLONE_BIN" delete \
  "${RCLONE_REMOTE}:vault-history" \
  --min-age 30d \
  --log-level INFO 2>/dev/null || true

# ---- Monthly snapshot (first run of each month) ----
MONTHLY_MARKER="${DATA_PATH}/.backup-month-${MONTH}"
if [[ ! -f "$MONTHLY_MARKER" ]]; then
  log "creating monthly snapshot for ${MONTH}..."
  "$RCLONE_BIN" sync \
    "$VAULT_PATH" \
    "${RCLONE_REMOTE}:vault-monthly/${MONTH}" \
    --exclude ".git/**" \
    --log-level INFO

  touch "$MONTHLY_MARKER"
  log "monthly snapshot done"

  # Prune monthly snapshots older than 12 months.
  # rclone doesn't prune by count, so we delete the oldest marker and remote dir.
  OLD_MONTH=$(date -d "13 months ago" +%Y-%m 2>/dev/null || date -v-13m +%Y-%m 2>/dev/null || true)
  if [[ -n "$OLD_MONTH" ]]; then
    "$RCLONE_BIN" purge "${RCLONE_REMOTE}:vault-monthly/${OLD_MONTH}" \
      --log-level INFO 2>/dev/null || true
    rm -f "${DATA_PATH}/.backup-month-${OLD_MONTH}"
  fi
fi

log "backup complete"
