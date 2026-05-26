# Digital Parent

A family AI assistant running on a Raspberry Pi, accessible via Telegram. It remembers things about the kids, manages the calendar, sends proactive reminders, and runs a weekly family reflection sync.

Full spec and architecture: see [DIGITAL_PARENT.md](./DIGITAL_PARENT.md).

---

## Running the bot

### Prerequisites

- Node.js 20+
- A Telegram bot token (via @BotFather)
- Your numeric Telegram user IDs (message @userinfobot to find them)

### Setup

```bash
cd bot
npm install
cp ../.env.example .env
# Fill in the values in bot/.env
```

### Local development

```bash
cd bot
npm run dev
```

Runs with `tsx watch` — restarts on file changes.

### Docker (recommended for full-stack testing)

Mirrors the production environment. Data is wiped on `docker compose down -v`.

```bash
# First run — builds the image
docker compose up --build

# Subsequent runs
docker compose up

# Stop and wipe all data for a clean slate
docker compose down -v
```

Requires Docker Desktop and a logged-in Claude Code session on your host machine. See [Docker in the developer guide](./docs/developer.md#docker) for full details.

### Production (on the Pi)

```bash
cd bot
npm run build
npm start
```

The systemd service handles process management in production.

---

## Project structure

```
/
├── DIGITAL_PARENT.md    # Full spec and architecture (source of truth)
├── CLAUDE.md            # Points Claude Code to the spec
├── .env.example         # Required environment variables (copy to bot/.env and fill in)
├── docker-compose.yml   # Full-stack local testing
├── docs/                # Developer documentation
├── bot/
│   ├── Dockerfile
│   ├── src/
│   │   ├── index.ts              # Entry point — wires config + client + bot
│   │   ├── config.ts             # Env var loading and validation
│   │   ├── bot.ts                # DigitalParentBot class and handlers
│   │   ├── claude.ts             # ClaudeClient interface + shared types
│   │   └── claude-code-client.ts # Current implementation (claude -p)
│   ├── package.json
│   └── tsconfig.json
└── ...                  # More directories added per milestone
```

---

## For developers

| Topic | Doc |
|---|---|
| Docker setup and commands | [docs/developer.md#docker](./docs/developer.md#docker) |
| Module map and architecture | [docs/developer.md#module-map](./docs/developer.md#module-map) |
| Environment variables explained | [docs/developer.md#environment-variables](./docs/developer.md#environment-variables) |
| Swapping the Claude client (SDK vs headless) | [docs/developer.md#swapping-the-claude-client](./docs/developer.md#swapping-the-claude-client) |
| Adding a new message handler | [docs/developer.md#adding-a-new-message-handler](./docs/developer.md#adding-a-new-message-handler) |
| Local vs Pi differences | [docs/developer.md#local-vs-pi-differences](./docs/developer.md#local-vs-pi-differences) |
