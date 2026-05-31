#!/usr/bin/env bash
# Weekly sync starter — invoked by two systemd timers:
#   digital-parent-sync.timer       — Sunday 7pm AEST (starts the sync)
#   digital-parent-sync-resume.timer — Monday 8am AEST (resumes if paused)
#
# On Sunday: starts a Claude weekly-sync session, writes sync-session.json,
# and posts the opening message + first question to Telegram.
# The running bot handles all subsequent turns via --continue.
#
# On Monday: if sync-session.json exists with status=paused, posts a gentle
# nudge and marks it active again so the bot can continue taking replies.

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

: "${TELEGRAM_BOT_TOKEN:?TELEGRAM_BOT_TOKEN is not set}"
: "${TG_CHAT_ID:?TG_CHAT_ID is not set}"
: "${CLAUDE_BIN:=claude}"
: "${DATA_PATH:=$PROJECT_ROOT/data}"

LOG_PREFIX="[weekly-sync]"
SYNC_FILE="$DATA_PATH/sync-session.json"

log()  { echo "$LOG_PREFIX $*"; }
die()  { echo "$LOG_PREFIX ERROR: $*" >&2; exit 1; }

# Check existing session state.
STATUS=""
if [[ -f "$SYNC_FILE" ]]; then
  STATUS=$(python3 -c "import json,sys; print(json.load(open('$SYNC_FILE')).get('status',''))" 2>/dev/null || echo "")
fi

if [[ "$STATUS" == "active" ]]; then
  log "sync already active — skipping"
  exit 0
fi

# Monday resume: if a paused session exists, nudge the family and reactivate.
if [[ "$STATUS" == "paused" ]]; then
  log "resuming paused sync..."

  NUDGE="Good morning! Just picking up where we left off with the weekly sync. Take your time — answer whenever you're ready."

  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    --data-urlencode "chat_id=$TG_CHAT_ID" \
    --data-urlencode "text=$NUDGE" \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage")

  if [[ "$HTTP_STATUS" == "200" ]]; then
    python3 - "$SYNC_FILE" <<'PYEOF'
import json, sys, time
p = sys.argv[1]
data = json.load(open(p))
data["status"] = "active"
data["lastActivityAt"] = int(time.time() * 1000)
with open(p, "w") as f:
    json.dump(data, f, indent=2)
PYEOF
    log "sync resumed"
  else
    log "WARNING: Telegram nudge returned HTTP $HTTP_STATUS"
  fi
  exit 0
fi

log "starting weekly sync..."

OPENING=$(
  "$CLAUDE_BIN" -p \
    --model claude-opus-4-8 \
    --agent weekly-sync \
    "Start the weekly family sync. Post your opening message and ask the first question." \
    2>/dev/null
) || die "claude invocation failed (exit $?)"

if [[ -z "$OPENING" ]]; then
  die "claude returned empty output"
fi

# Write sync session state. The running bot reads this on each incoming message.
mkdir -p "$DATA_PATH"
python3 - "$SYNC_FILE" <<'PYEOF'
import json, sys, time
p = sys.argv[1]
now = int(time.time() * 1000)
with open(p, "w") as f:
    json.dump({"startedAt": now, "lastActivityAt": now, "questionCount": 1, "status": "active"}, f, indent=2)
PYEOF

log "posting opening message to Telegram chat $TG_CHAT_ID"

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  --data-urlencode "chat_id=$TG_CHAT_ID" \
  --data-urlencode "text=$OPENING" \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage")

if [[ "$HTTP_STATUS" != "200" ]]; then
  # Don't block — log the error but clear the sync state so the bot doesn't hang.
  log "WARNING: Telegram API returned HTTP $HTTP_STATUS"
  rm -f "$SYNC_FILE"
  die "Telegram send failed"
fi

log "done — sync active, bot will handle subsequent turns"
