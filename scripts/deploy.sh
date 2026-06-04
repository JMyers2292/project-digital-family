#!/usr/bin/env bash
# Deploy new code to the running Pi bot.
# Run from /opt/digital-parent after pulling changes:
#   bash scripts/deploy.sh
#
# What it does:
#   1. git pull (fast-forward only — no surprises)
#   2. npm ci  — installs any new/updated dependencies
#   3. npm run build — compiles TypeScript
#   4. systemctl restart — replaces the running process (~2s downtime)
#
# Telegram queues messages while the bot is restarting, so nothing is lost.
# The weekly sync session (sync-session.json) persists across restarts.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BOT_DIR="$PROJECT_ROOT/bot"
SERVICE="digital-parent-bot"

log() { echo "[deploy] $*"; }
die() { echo "[deploy] ERROR: $*" >&2; exit 1; }

cd "$PROJECT_ROOT"

# 1. Pull latest changes
log "pulling latest changes..."
git pull --ff-only || die "git pull failed — resolve conflicts manually then re-run"

# 2. Install dependencies (only installs what changed, fast if nothing new)
log "installing dependencies..."
npm ci --prefix "$BOT_DIR" --silent

# 3. Build TypeScript
log "building..."
npm run build --prefix "$BOT_DIR" || die "build failed — fix the errors then re-run"

# 4. Restart the service
log "restarting $SERVICE..."
if systemctl is-active --quiet "$SERVICE"; then
  sudo systemctl restart "$SERVICE"
  # Give it a moment then verify it came back up
  sleep 2
  if systemctl is-active --quiet "$SERVICE"; then
    log "done — $SERVICE is running"
  else
    die "$SERVICE failed to start — check: journalctl -u $SERVICE -n 50"
  fi
else
  log "$SERVICE is not currently running — starting it"
  sudo systemctl start "$SERVICE"
fi
