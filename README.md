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
cp ../.env.example ../.env
# Fill in the values in .env
```

### Development

```bash
cd bot
npm run dev
```

Runs with `tsx watch` — restarts on file changes.

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
├── DIGITAL_PARENT.md   # Full spec and architecture (source of truth)
├── CLAUDE.md           # Points Claude Code to the spec
├── .env.example        # Required environment variables (copy to .env and fill in)
├── docs/               # Developer documentation
├── bot/
│   ├── src/
│   │   ├── index.ts              # Entry point — wires config + client + bot
│   │   ├── config.ts             # Env var loading and validation
│   │   ├── bot.ts                # DigitalParentBot class and handlers
│   │   ├── claude.ts             # ClaudeClient interface + shared types
│   │   └── claude-code-client.ts # Current implementation (claude -p)
│   ├── package.json
│   └── tsconfig.json
└── ...                 # More directories added per milestone
```

---

## For developers

| Topic | Doc |
|---|---|
| Module map and architecture | [docs/developer.md#module-map](./docs/developer.md#module-map) |
| Environment variables explained | [docs/developer.md#environment-variables](./docs/developer.md#environment-variables) |
| Swapping the Claude client (SDK vs headless) | [docs/developer.md#swapping-the-claude-client](./docs/developer.md#swapping-the-claude-client) |
| Adding a new message handler | [docs/developer.md#adding-a-new-message-handler](./docs/developer.md#adding-a-new-message-handler) |
| Local vs Pi differences | [docs/developer.md#local-vs-pi-differences](./docs/developer.md#local-vs-pi-differences) |
