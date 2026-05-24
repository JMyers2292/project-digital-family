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
├── bot/
│   ├── src/index.ts    # Main bot entry point
│   ├── package.json
│   └── tsconfig.json
└── ...                 # More directories added per milestone
```
