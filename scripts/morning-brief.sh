#!/usr/bin/env bash
# Morning brief — invoked by systemd timer at 7am.
# Calls claude -p --agent morning-brief, then posts the result to Telegram.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load .env if present (local/dev runs)
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

LOG_PREFIX="[morning-brief]"

log() { echo "$LOG_PREFIX $*"; }
die() { echo "$LOG_PREFIX ERROR: $*" >&2; exit 1; }

log "generating brief..."

BRIEF=$(
  "$CLAUDE_BIN" -p \
    --model claude-sonnet-4-6 \
    --agent morning-brief \
    "Generate today's morning brief." \
    2>/dev/null
) || die "claude invocation failed (exit $?)"

if [[ -z "$BRIEF" ]]; then
  die "claude returned empty output"
fi

log "posting to Telegram chat $TG_CHAT_ID"

# URL-encode newlines for the Telegram API
ESCAPED=$(printf '%s' "$BRIEF" | python3 -c "
import sys, urllib.parse
print(urllib.parse.quote(sys.stdin.read()))
")

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  --data-urlencode "chat_id=$TG_CHAT_ID" \
  --data-urlencode "text=$BRIEF" \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage")

if [[ "$HTTP_STATUS" != "200" ]]; then
  die "Telegram API returned HTTP $HTTP_STATUS"
fi

log "done (${#BRIEF} chars)"
