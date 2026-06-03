# Digital Parent

A family AI assistant running on a Raspberry Pi, accessible via Telegram. It remembers things about the kids, manages the calendar, sends proactive reminders, and runs a weekly family reflection sync.

Full spec and architecture: see [DIGITAL_PARENT.md](./DIGITAL_PARENT.md).

---

## How it works

Digital Parent reads and writes to a markdown vault on the Pi. Everything it learns gets stored there. The better the vault is filled in, the smarter the bot gets — it reads the relevant files before answering any question.

**What it knows:**
- Kid profiles (DOB, allergies, daycare schedule, GP, medications)
- Household dietary constraints
- Weekly routines (daycare days, bin night, etc.)
- Measurement and health logs for each child
- Reminders and todos
- Weekly sync notes (patterns over time)
- Shopping list

The bot never guesses about your family. If it doesn't know something yet, it says so and asks.

---

## Ideal first-run flow

### 1. Set up the vault

The vault is empty by default. The more you fill in upfront, the more useful every conversation is from day one.

**Priority files (fill these in first):**

```bash
# On the Pi:
nano /opt/digital-parent/vault/household/diet.md
```
Add your household's dietary constraints, preferred shops, budget, and any safe staples you rely on. Every food and meal question reads this file.

```bash
nano /opt/digital-parent/vault/household/routines.md
```
Add your weekly schedule — daycare days, swimming lessons, bin night, etc. The morning brief uses this to tell you what's on today.

```bash
nano /opt/digital-parent/vault/kids/child-1/profile.md
nano /opt/digital-parent/vault/kids/child-2/profile.md
```
Add each child's DOB, allergies, GP, daycare, current clothing/shoe sizes, and any key health info. Questions like "what size shoes does the toddler wear?" pull from here.

### 2. Have the onboarding conversation

Once the bot is running, start a conversation to let it learn your family:

> "Can I tell you about the kids?"

It will ask follow-up questions. Anything you tell it that's a fact gets written to the vault. You can also just use it naturally and log things as they come up.

### 3. Run /feedback

```
/feedback
```

The bot will audit the vault and tell you what's missing and what would make it more useful. Good to run after initial setup, and again after a few weeks.

### 4. Let it run for a week

After the first weekly sync (Sunday 7pm, or `/sync` to trigger it now), the bot starts building up pattern awareness across the family — sleep, eating, mood, health, logistics.

---

## Talking to Digital Parent

### Natural language (just type)

Most things work without any commands. The bot routes your message to the right handler automatically:

| What you say | What happens |
|---|---|
| "Baby weighed 7.4kg at the check-up today" | Logged to `vault/kids/child-2/measurements.md` |
| "Toddler had a fever of 38.5 last night" | Logged to `vault/kids/child-1/health.md` |
| "Remind me to call the GP on Thursday" | Added to `vault/reminders/inbox.md` |
| "Add milk, bread and rice crackers to the shopping list" | Added to the shopping list |
| "What does the toddler weigh?" | Reads back the last logged measurement |
| "What should I make for dinner tonight?" | Reads `diet.md`, suggests something safe |
| "We've been struggling with sleep this week, any thoughts?" | Routes to Sonnet reasoner for a thoughtful reply |

### When the bot gets it wrong

If it misclassifies what you meant, rephrase or use the specific slash command. The `/ask` command always goes straight to the reasoner if you want a considered response rather than a data lookup.

---

## Commands

| Command | What it does |
|---|---|
| `/ask <question>` | Think something through (always uses Sonnet, skips the router) |
| `/log <thing>` | Explicitly log a fact — weight, milestone, health note |
| `/kid <name> <thing>` | Quick log for a specific child — e.g. `/kid toddler slept through` |
| `/remind <text>` | Add a reminder — e.g. `/remind call GP Thursday` |
| `/shop` | View the current shopping list |
| `/shop add <items>` | Add items — e.g. `/shop add milk, oat milk, rice crackers` |
| `/shop clear` | Clear the list once you've shopped |
| `/event <text>` | Add a calendar event (calendar integration — M5) |
| `/today` | What's on today (calendar — M5) |
| `/week` | What's on this week (calendar — M5) |
| `/sync` | Start the weekly family reflection sync now (otherwise auto Sunday 7pm) |
| `/feedback` | Audit of the vault — what does the bot know and what's worth adding |
| `/create <request>` | Generate a file — e.g. `/create a weekly menu as HTML` |
| `/help` | Show the full command list |

---

## Memory — the vault

The vault is at `/opt/digital-parent/vault/` on the Pi. Everything is plain markdown.

| File | Purpose | How it's managed |
|---|---|---|
| `kids/child-1/profile.md` | Static facts — DOB, allergies, GP, sizes | You fill it in manually |
| `kids/child-1/measurements.md` | Weight, height log | Bot appends via `/log` or prose |
| `kids/child-1/health.md` | Appointments, illness, medications | Bot appends via `/log` or prose |
| `kids/child-1/milestones.md` | Firsts, developmental notes | Bot appends via `/log` or prose |
| `household/diet.md` | Dietary constraints, safe staples, shops | You fill it in manually |
| `household/routines.md` | Weekly schedule, recurring reminders | You fill it in manually |
| `household/notes.md` | Bills, repairs, supplies, anything else | Bot appends or you edit |
| `reminders/inbox.md` | Todo inbox — read by the morning brief | Bot appends, you clear done items |
| `syncs/YYYY-WW.md` | Weekly sync notes | Bot writes after each sync |
| `people/contacts.md` | GP, daycare, useful contacts | You fill it in manually |

**Tip:** The vault is just markdown files on the Pi's SSD. You can edit them directly with any text editor, or view them in Obsidian if you want a nicer interface. The bot's changes appear immediately — there's no sync step.

---

## Scheduled jobs

| Job | When | What it does |
|---|---|---|
| Morning brief | 7am daily | Short Telegram message: what's on today, reminders due, health follow-ups, anything in household notes |
| Weekly sync | Sunday 7pm | Multi-turn reflection conversation — asks about the kids, parents, logistics, household; writes a structured note to the vault |
| Monday resume | Monday 8am | Gentle resume if Sunday's sync was left incomplete |
| Nightly backup | 2am daily | rclone → encrypted Google Drive (requires one-time setup) |

The morning brief is the main "this bot knows my family" moment. Fill in the vault templates first and check what it says the next morning.

---

## Getting more out of it over time

**Week 1:** Fill in the vault templates. Log a few things naturally. Check `/feedback`.

**Week 2–3:** Do the weekly sync on Sunday. Answer the questions honestly. The bot starts building up patterns.

**Month 1+:** The weekly sync cross-references the last 4 weeks. You'll start seeing "this is the third week sleep has come up" type observations. That's when it starts feeling genuinely useful rather than just a logging tool.

**Practical tips:**
- Log things as they happen — a quick "baby had 38.9 fever this morning" takes 5 seconds and is available forever
- Use `/ask` for anything that needs real thought — meal planning, health questions, logistical decisions
- The shopping list is fastest via prose: "add almond milk and corn thins to the shopping list"
- `/create a weekly menu as HTML` generates a formatted file attachment you can print or save
- If the bot gives a weird response, `/ask` with more context usually fixes it

---

## Running the bot

### Prerequisites

- Node.js 22+
- A Telegram bot token (via @BotFather)
- Your numeric Telegram user IDs (message @userinfobot to find them)
- Claude Code installed and logged in (`claude login`)

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
docker compose up --build   # first run
docker compose up           # subsequent runs
docker compose down -v      # stop and wipe all data
```

Requires Docker Desktop and a logged-in Claude Code session on your host machine.

### Production (on the Pi)

```bash
cd bot && npm run build

# Install and enable systemd services
sudo cp systemd/*.service systemd/*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now digital-parent-bot.service
sudo systemctl enable --now digital-parent-brief.timer
sudo systemctl enable --now digital-parent-sync.timer
sudo systemctl enable --now digital-parent-sync-resume.timer
sudo systemctl enable --now digital-parent-backup.timer   # requires rclone setup first
```

---

## Project structure

```
/
├── DIGITAL_PARENT.md          # Full spec and architecture (source of truth)
├── CLAUDE.md                  # Runtime context for claude -p
├── .env.example               # Required env vars (copy to bot/.env)
├── docker-compose.yml
├── .claude/
│   ├── agents/
│   │   ├── router.md          # Haiku — intent classification
│   │   ├── reasoner.md        # Sonnet — questions, advice, meal plans
│   │   ├── morning-brief.md   # Sonnet — daily brief
│   │   └── weekly-sync.md     # Opus — weekly reflection
│   └── mcp.json               # Filesystem MCP (vault access)
├── bot/
│   └── src/
│       ├── index.ts            # Entry point
│       ├── config.ts           # Env var loading
│       ├── bot.ts              # DigitalParentBot — all handlers
│       ├── router.ts           # Haiku intent router
│       ├── state.ts            # SQLite + sync session state
│       ├── claude.ts           # ClaudeClient interface
│       ├── claude-code-client.ts
│       ├── telegram.ts         # HTTP Telegram sender (for cron jobs)
│       └── handlers/
│           ├── crud.ts         # Vault reads/writes
│           ├── reminder.ts     # Reminders inbox
│           ├── shopping.ts     # Shopping list
│           ├── escalate.ts     # Sonnet reasoner
│           ├── weekly-sync.ts  # Weekly sync session
│           ├── artifact.ts     # File generation
│           └── calendar.ts     # Calendar stub (M5)
├── vault/
│   ├── household/
│   │   ├── diet.md            # Fill in: dietary constraints
│   │   └── routines.md        # Fill in: weekly schedule
│   └── kids/
│       ├── child-1/profile.md # Fill in: kid 1 static facts
│       └── child-2/profile.md # Fill in: kid 2 static facts
├── scripts/
│   ├── morning-brief.sh
│   ├── weekly-sync.sh
│   └── backup.sh
└── systemd/                   # Service and timer unit files
```

---

## For developers

| Topic | Doc |
|---|---|
| Full spec and architecture | [DIGITAL_PARENT.md](./DIGITAL_PARENT.md) |
| Environment variables | [.env.example](./.env.example) |
| Swapping the Claude client (SDK vs headless) | See `bot/src/claude.ts` interface comments |
