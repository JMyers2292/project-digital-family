#!/usr/bin/env bash
# Pi first-time setup for Digital Parent.
# Run as the digital-parent user on a fresh Raspberry Pi OS Lite install:
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/JMyers2292/project-digital-family/main/scripts/pi-setup.sh)
#
# Or if you've already cloned the repo:
#   bash /opt/digital-parent/scripts/pi-setup.sh
#
# What it does:
#   1. System update
#   2. Node.js 22
#   3. Claude Code CLI
#   4. Clone / update repo to /opt/digital-parent
#   5. npm ci + build
#   6. Runtime directories + empty vault files
#   7. Systemd services + timers
#   8. Sudoers entry for /update command
#   9. Prompts for .env values if not already set

set -euo pipefail

REPO_URL="https://github.com/JMyers2292/project-digital-family.git"
PROJECT_ROOT="/opt/digital-parent"
SERVICE_USER="digital-parent"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[setup]${NC} $*"; }
warn() { echo -e "${YELLOW}[setup]${NC} $*"; }
die()  { echo -e "${RED}[setup] ERROR:${NC} $*" >&2; exit 1; }
step() { echo; echo -e "${GREEN}━━━ $* ━━━${NC}"; }

# ---- Step 1: System update ----
step "1/8  Updating system packages"
sudo apt-get update -qq
sudo apt-get upgrade -y -qq
sudo apt-get install -y -qq git curl
log "done"

# ---- Step 2: Node.js 22 ----
step "2/8  Installing Node.js 22"
if node --version 2>/dev/null | grep -q "^v22"; then
  log "Node.js 22 already installed ($(node --version))"
else
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >/dev/null
  sudo apt-get install -y nodejs -qq
  log "installed $(node --version)"
fi

# ---- Step 3: Claude Code ----
step "3/8  Installing Claude Code CLI"
if claude --version &>/dev/null; then
  log "Claude Code already installed ($(claude --version 2>&1 | head -1))"
else
  sudo npm install -g @anthropic-ai/claude-code --silent
  log "installed"
fi

# ---- Step 4: Clone / update repo ----
step "4/8  Setting up project at $PROJECT_ROOT"
if [[ -d "$PROJECT_ROOT/.git" ]]; then
  log "repo already exists — pulling latest"
  git -C "$PROJECT_ROOT" pull --ff-only
else
  sudo mkdir -p "$PROJECT_ROOT"
  sudo chown "$SERVICE_USER:$SERVICE_USER" "$PROJECT_ROOT"
  git clone "$REPO_URL" "$PROJECT_ROOT"
fi

# ---- Step 5: Install dependencies + build ----
step "5/8  Installing dependencies and building"
npm ci --prefix "$PROJECT_ROOT/bot" --silent
npm run build --prefix "$PROJECT_ROOT/bot" --silent
log "build complete"

# ---- Step 6: Runtime directories ----
step "6/8  Creating runtime directories"
mkdir -p \
  "$PROJECT_ROOT/data" \
  "$PROJECT_ROOT/vault/reminders" \
  "$PROJECT_ROOT/vault/syncs" \
  "$PROJECT_ROOT/vault/people"

# Touch runtime files so the bot doesn't error on first read
touch -a "$PROJECT_ROOT/vault/reminders/inbox.md"
touch -a "$PROJECT_ROOT/vault/household/notes.md"
touch -a "$PROJECT_ROOT/vault/people/contacts.md"
log "done"

# ---- Step 7: .env setup ----
step "7/8  Configuring environment"
ENV_FILE="$PROJECT_ROOT/bot/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$PROJECT_ROOT/.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  warn ".env created from template — you need to fill it in."
  warn "Run: nano $ENV_FILE"
  warn ""
  warn "Required values:"
  warn "  TELEGRAM_BOT_TOKEN — from @BotFather"
  warn "  TG_USER_1          — your Telegram numeric user ID (from @userinfobot)"
  warn "  TG_USER_2          — partner's Telegram user ID (or leave blank)"
  warn "  TG_CHAT_ID         — the group chat ID"
  warn ""
  warn "These are pre-filled and should not need changing:"
  # Pre-fill the Pi-specific paths
  sed -i "s|^PROJECT_ROOT=.*|PROJECT_ROOT=$PROJECT_ROOT|" "$ENV_FILE"
  sed -i "s|^DATA_PATH=.*|DATA_PATH=$PROJECT_ROOT/data|" "$ENV_FILE"
  sed -i "s|^VAULT_PATH=.*|VAULT_PATH=$PROJECT_ROOT/vault|" "$ENV_FILE"
  # Pi-specific: disable Happy Eyeballs to fix Node.js 22 TLS timeouts on WiFi (no IPv6 routing)
  sed -i "s|^DISABLE_IPV6=.*|DISABLE_IPV6=true|" "$ENV_FILE"
  sed -i "s|^NODE_OPTIONS=.*|NODE_OPTIONS=--require $PROJECT_ROOT/fix-network.cjs|" "$ENV_FILE"
  log "paths written to .env"
else
  log ".env already exists — skipping"
fi

# ---- Step 7b: Resolve mcp.json vault path ----
# ${VAULT_PATH} may not expand in Claude Code's mcp.json parser, so write the
# actual path directly into the project-scoped MCP config.
MCP_FILE="$PROJECT_ROOT/.claude/mcp.json"
cat > "$MCP_FILE" <<MCPEOF
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "$PROJECT_ROOT/vault"],
      "env": {
        "PATH": "/usr/local/bin:/usr/bin:/bin"
      }
    }
  }
}
MCPEOF
log "mcp.json vault path set to $PROJECT_ROOT/vault"

# ---- Step 8: Systemd services ----
step "8/8  Installing systemd services"
sudo cp "$PROJECT_ROOT/systemd/"*.service "$PROJECT_ROOT/systemd/"*.timer /etc/systemd/system/
sudo systemctl daemon-reload

# Enable but don't start timers until .env is confirmed
sudo systemctl enable digital-parent-bot.service
sudo systemctl enable digital-parent-brief.timer
sudo systemctl enable digital-parent-sync.timer
sudo systemctl enable digital-parent-sync-resume.timer
sudo systemctl enable digital-parent-backup.timer
log "services registered"

# Sudoers entry for /update slash command
SUDOERS_FILE="/etc/sudoers.d/digital-parent"
if [[ ! -f "$SUDOERS_FILE" ]]; then
  echo "$SERVICE_USER ALL=(ALL) NOPASSWD: /bin/systemctl restart digital-parent-bot" \
    | sudo tee "$SUDOERS_FILE" >/dev/null
  sudo chmod 440 "$SUDOERS_FILE"
  log "sudoers entry added"
else
  log "sudoers entry already exists"
fi

# ---- Done ----
echo
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Setup complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo
echo "Next steps:"
echo
echo "  1. Fill in your credentials:"
echo "       nano $ENV_FILE"
echo
echo "  2. Log in to Claude (do this once — opens a browser link):"
echo "       claude login"
echo
echo "  3. Start the bot:"
echo "       sudo systemctl start digital-parent-bot"
echo "       sudo systemctl start digital-parent-brief.timer"
echo "       sudo systemctl start digital-parent-sync.timer"
echo
echo "  4. Check it's running:"
echo "       sudo systemctl status digital-parent-bot"
echo "       journalctl -u digital-parent-bot -f"
echo
echo "  5. Fill in the vault templates so the bot knows your family:"
echo "       nano $PROJECT_ROOT/vault/household/diet.md"
echo "       nano $PROJECT_ROOT/vault/household/routines.md"
echo "       nano $PROJECT_ROOT/vault/kids/child-1/profile.md"
echo "       nano $PROJECT_ROOT/vault/kids/child-2/profile.md"
echo
