# Digital Parent — Build Brief

A family-shared AI assistant that runs on a Raspberry Pi, accessible via Telegram, that remembers everything about the kids, manages the calendar, sends proactive reminders, and runs a weekly family reflection sync.

This document is the working spec. Read it end-to-end before writing code. Build incrementally per the milestones at the bottom. Update this file as decisions evolve.

---

## Users

- **Jeremy** — primary developer, based in Australia (AEST)
- **Partner** — co-user, same Telegram group chat
- Two kids: a toddler and a baby

Dietary constraints in the household: wheat-free, dairy-free, egg-free. Shops at Woolworths. Budget-conscious.

---

## What we're building

- A Node.js + TypeScript bot running on the Pi as a systemd service
- Listens to a single Telegram group chat (Jeremy + partner + bot)
- Routes messages through a tiered Claude model setup
- Reads and writes to an Obsidian markdown vault for persistent memory
- Reads and writes Google Calendar for scheduling
- Scheduled jobs (systemd timers) for daily brief, weekly sync, backups
- Voice notes transcribed locally via `whisper.cpp`
- Remote access via Tailscale only — no public exposure

---

## Stack

| Concern | Choice |
|---|---|
| Hardware | Raspberry Pi 4 Model B, 4GB RAM + 1TB SSD |
| OS | Raspberry Pi OS Lite (64-bit) |
| Runtime | Node.js 20+ with TypeScript |
| Telegram lib | `grammy` |
| LLM runtime | Claude Code headless (`claude -p`), invoked per call |
| Models | Haiku (router/CRUD), Sonnet (reasoning), Opus (weekly sync only) |
| Memory | Obsidian vault (markdown on SSD) |
| Calendar | Google Calendar via OAuth + MCP |
| Transcription | `whisper.cpp` local |
| State | SQLite (better-sqlite3) |
| Process management | systemd |
| Remote access | Tailscale |
| Backups | rclone → encrypted Google Drive |
| Token optimisation | Caveman (caveman-shrink for MCP descriptions, caveman-compress for system prompts) — internal artifacts only, never user-facing prose |

---

## Locked decisions

1. **Calendar**: Google Calendar, single shared "Family" calendar both phones subscribe to
2. **Chat**: one Telegram group chat with both partners + bot, sender tagged per message
3. **Transcription**: `whisper.cpp` local (free, private)
4. **Backups**: rclone → encrypted Google Drive (free)
5. **Weekly sync timing**: Sunday 7pm AEST; if responses thin by Sunday EOD, continue Monday 8am
6. **Sync privacy**: fully shared, no per-partner private reflections
7. **Routing**: slash commands shortcut to handlers; prose goes through Haiku router; needs_reasoning escalates to Sonnet; weekly sync uses Opus
8. **Runtime**: Claude Code headless (not the Agent SDK, not direct API calls)
9. **Model selection**: via `--model` flag and per-agent definitions in `.claude/agents/`
10. **Caveman**: applied to internal-only artifacts (MCP tool descriptions, classification prompts). Never applied to: Telegram replies, weekly sync output, morning brief.
11. **Session management**: persistent Claude Code session per Telegram chat via `--continue` / `--resume`. Summarisation to vault when context grows is a later optimisation.
12. **Router pattern**: implemented as a subagent at `.claude/agents/router.md`
13. **Project location on Pi**: `/opt/digital-parent/` with its own `.claude/` directory (project-scoped)
14. **Listener → Claude Code**: shell out via `child_process.spawn`, one invocation per turn. Slower than a long-lived process but more reliable.

---

## Architecture

```
You + partner (phone)
      ↓
   Telegram group chat (with bot)
      ↓
Telegram Bot API (long-polling)
      ↓
Pi: Node.js listener service (grammy)
      ↓
  Slash command? → direct handler (plain code or specific claude invocation)
  Prose?         → router subagent (Haiku) returns structured JSON
                    ↓
              ┌─────┴──────┬──────────────┬──────────────┐
              │            │              │              │
          CRUD/read    Calendar       Reminder       Needs reasoning
          plain code   handler        handler        → Sonnet via
          (no LLM)                                     claude -p
                            ↓
                      Reply to Telegram
                            ↓
              Calendar events sync to both phones

Scheduled (systemd timers):
- Daily 7am AEST → morning brief (Sonnet) → posts to group
- Sunday 7pm AEST → weekly sync (Opus) → multi-turn conversation, writes sync note
- Nightly 2am → rclone backup to encrypted Google Drive
```

---

## Project layout

```
/opt/digital-parent/
├── bot/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts            # grammy listener, slash + prose dispatch
│   │   ├── router.ts           # invokes router subagent, parses JSON
│   │   ├── claude.ts           # child_process wrapper for `claude -p`
│   │   ├── state.ts            # SQLite for session IDs and chat state
│   │   ├── telegram.ts         # helpers for sending messages from non-bot contexts (cron jobs)
│   │   └── handlers/
│   │       ├── crud.ts         # vault read/write, no LLM
│   │       ├── calendar.ts     # Google Calendar via MCP/API
│   │       ├── reminder.ts     # appends to vault reminders inbox
│   │       └── escalate.ts     # invokes reasoner subagent
│   └── .env                    # secrets (gitignored)
├── .claude/
│   ├── settings.json           # project-scoped Claude Code config
│   ├── agents/
│   │   ├── router.md           # Haiku intent classifier
│   │   ├── reasoner.md         # Sonnet reasoning agent
│   │   └── weekly-sync.md      # Opus weekly sync agent
│   ├── skills/
│   │   ├── vault-writer/       # logs facts to vault correctly
│   │   ├── calendar-add/       # creates google calendar events
│   │   └── daily-brief/        # generates morning brief
│   ├── commands/
│   │   ├── morning-brief.md    # /morning-brief slash command for cron use
│   │   └── weekly-sync.md      # /weekly-sync slash command for cron use
│   └── mcp.json                # filesystem + google-calendar MCP server config
├── vault/                      # the Obsidian vault (or symlink to it)
│   ├── kids/
│   │   ├── toddler/
│   │   │   ├── profile.md
│   │   │   ├── measurements.md
│   │   │   ├── milestones.md
│   │   │   └── health.md
│   │   └── baby/
│   │       └── (same structure)
│   ├── household/
│   ├── people/                 # GP, daycare contacts etc
│   ├── reminders/
│   │   └── inbox.md
│   └── syncs/                  # YYYY-WW.md weekly notes
├── data/
│   └── state.db                # SQLite
├── scripts/
│   ├── morning-brief.sh        # called by systemd timer
│   ├── weekly-sync.sh          # called by systemd timer
│   └── backup.sh               # rclone backup
├── systemd/
│   ├── digital-parent-bot.service
│   ├── digital-parent-brief.service
│   ├── digital-parent-brief.timer
│   ├── digital-parent-sync.service
│   ├── digital-parent-sync.timer
│   ├── digital-parent-backup.service
│   └── digital-parent-backup.timer
└── logs/
```

---

## The three Claude Code agents

### `.claude/agents/router.md` — Haiku intent classifier

Returns strict JSON only. No prose, no markdown fences.

**Intents**: `crud_write | crud_read | calendar_add | calendar_read | calendar_update | calendar_delete | reminder_add | chitchat | needs_reasoning | unclear`

**Output schema**:
```json
{
  "intent": "...",
  "confidence": 0.0,
  "fields": { ... },
  "reply": "string | null"
}
```

Field schemas per intent:
- `crud_write`: `{subject, attribute, value, unit, date}`
- `crud_read`: `{subject, attribute}`
- `calendar_add`: `{title, datetime_start, datetime_end, for, location}`
- `calendar_read`: `{range, date}`
- `calendar_update`: `{event_query, changes}`
- `calendar_delete`: `{event_query}`
- `reminder_add`: `{text, trigger_date}`
- `chitchat`: `{}` — populate `reply` with a warm short response
- `needs_reasoning`: `{topic, why}`
- `unclear`: `{guess}` — populate `reply` with a clarifying question or usage tip

**Rules**:
- Default `date` to today (AEST) if unspecified
- Default `datetime_end` to start + 1 hour
- For `chitchat` and `unclear`, populate `reply`. For all others, `reply` is null.
- If confidence < 0.7, route to `unclear`.
- Preserve placeholder names like `[toddler]` and `[baby]` as-is.

### `.claude/agents/reasoner.md` — Sonnet reasoning layer

Warm, concise, opinionated. Has filesystem MCP access to the vault and calendar MCP access.

**Behaviour**:
- Pull only the relevant context (e.g. for a sleep question, read `/vault/kids/toddler/` and last 4 syncs — not the whole vault)
- Reply under ~150 words unless complexity warrants more
- Name patterns across time when spotted ("third week sleep has come up")
- Suggest one concrete next step, not a list of five
- Plain Australian English
- Acknowledge worry briefly before getting to substance
- Never give alarming medical/financial/relationship advice — point to a professional when warranted
- May read vault, may append to `/vault/reminders/inbox.md` — must NOT modify factual entries (that's CRUD's job) or create calendar events (suggest, ask for confirmation)

### `.claude/agents/weekly-sync.md` — Opus weekly reflection

Runs Sunday 7pm AEST. Asks 5–8 questions across dimensions, accepts async replies, writes structured note to `/vault/syncs/YYYY-WW.md`, cross-references prior 4 weeks, surfaces patterns.

**Dimensions**:
- Each kid individually (sleep, eating, mood, milestones, concerns, wins)
- Health (appointments, illness, medications)
- Logistics (what worked, what broke)
- Household (bills, repairs, supplies, deliveries)
- Each parent individually (stress, sleep, energy, weighing-on-you, good things)
- Partnership (time together, anything to address)
- Looking ahead (next week's prep)

**Behaviour**:
- One question per message, wait for replies, ~45 min timeout per question
- If by Sunday EOD < 4 questions answered, pause; Monday 8am gentle resume
- Never fabricate feelings or events not mentioned
- End with synthesis: what stood out, patterns noticed, todos queued, calendar items suggested, anything needing confirmation

**Sync note template**: see implementation in `.claude/agents/weekly-sync.md`

---

## Slash commands

Registered via `@BotFather` and handled directly in `src/index.ts`:

| Command | Behaviour |
|---|---|
| `/help` | List commands |
| `/today` | Read today's calendar + reminders, plain code, no LLM |
| `/week` | Read week's calendar + Haiku summary |
| `/ask <q>` | Direct Sonnet invocation, skips router |
| `/log <thing>` | Explicit CRUD write through Haiku parse |
| `/event <text>` | Calendar add through Haiku parse |
| `/remind <text>` | Append to vault reminders, Haiku parses |
| `/kid <name> <thing>` | Quick log to specific kid file |
| `/sync` | Trigger weekly sync now (otherwise auto Sunday 7pm) |
| `/feedback` | Sonnet gives advice on how the user is using the service |

---

## Routing flow (the heart of the bot)

For prose messages (not slash commands):

1. `grammy` receives message → extract `sender`, `chat_id`, `text`
2. Reject if sender not in allowlist (`TG_USER_JEREMY`, `TG_USER_PARTNER` env vars)
3. Invoke router subagent: `claude -p --agent router` with `sender: ...\nmessage: ...`
4. Parse JSON output (strip code fences defensively)
5. If `confidence < 0.7` → coerce to `unclear`
6. Dispatch by `intent`:
   - `chitchat` / `unclear` → reply with `result.reply`
   - `crud_write` / `crud_read` → `handlers/crud.ts` (no further LLM)
   - `calendar_*` → `handlers/calendar.ts`
   - `reminder_add` → `handlers/reminder.ts`
   - `needs_reasoning` → escalate to reasoner subagent with `--continue` or `--resume` for session continuity

---

## Vault schema

Markdown files, append-only where possible for easy grep + git history.

### `/vault/kids/{name}/profile.md`
Static facts: DOB, blood type, allergies, current size (clothing/shoes), GP, daycare, key contacts.

### `/vault/kids/{name}/measurements.md`
Append-only log:
```
2026-05-24 weight 7.2kg (logged by jeremy)
2026-05-24 height 65cm (logged by partner)
```

### `/vault/kids/{name}/milestones.md`
Free-form dated entries.

### `/vault/kids/{name}/health.md`
Appointments, illnesses, medications, observations.

### `/vault/household/`
Recurring bills, repairs, supplier contacts, supplies running low.

### `/vault/reminders/inbox.md`
Append-only todo inbox the daily brief reads from.

### `/vault/syncs/YYYY-WW.md`
Weekly sync notes (Opus-generated, see weekly-sync.md template).

---

## MCP servers

`.claude/mcp.json`:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/opt/digital-parent/vault"]
    },
    "google-calendar": {
      "command": "npx",
      "args": ["-y", "@<calendar-mcp-package>"],
      "env": {
        "GOOGLE_OAUTH_CLIENT_ID": "...",
        "GOOGLE_OAUTH_CLIENT_SECRET": "...",
        "GOOGLE_OAUTH_REFRESH_TOKEN": "..."
      }
    }
  }
}
```

(Confirm exact Google Calendar MCP package name when implementing — there are several; pick the most maintained.)

---

## Code skeletons

### `src/claude.ts`

```typescript
import { spawn } from "node:child_process";

const PROJECT_ROOT = "/opt/digital-parent";

export type ClaudeInvocation = {
  agent: "router" | "reasoner" | "weekly-sync";
  prompt: string;
  sessionId?: string;
  continueChat?: boolean;
  timeoutMs?: number;
};

export type ClaudeResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
};

export async function invokeClaude(opts: ClaudeInvocation): Promise<ClaudeResult> {
  const args: string[] = ["-p", "--agent", opts.agent];
  if (opts.sessionId) args.push("--resume", opts.sessionId);
  else if (opts.continueChat) args.push("--continue");

  const timeout = opts.timeoutMs ?? 60_000;
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn("claude", args, {
      cwd: PROJECT_ROOT,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`claude timed out after ${timeout}ms`));
    }, timeout);
    child.stdout.on("data", d => stdout += d.toString());
    child.stderr.on("data", d => stderr += d.toString());
    child.on("close", code => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? -1, durationMs: Date.now() - start });
    });
    child.on("error", err => { clearTimeout(timer); reject(err); });
    child.stdin.write(opts.prompt);
    child.stdin.end();
  });
}

export type RouterResult = {
  intent: "crud_write" | "crud_read" | "calendar_add" | "calendar_read"
        | "calendar_update" | "calendar_delete" | "reminder_add"
        | "chitchat" | "needs_reasoning" | "unclear";
  confidence: number;
  fields: Record<string, any>;
  reply: string | null;
};

export function parseRouterOutput(stdout: string): RouterResult | null {
  let cleaned = stdout.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]) as RouterResult; }
  catch { return null; }
}
```

### `src/router.ts`

```typescript
import { invokeClaude, parseRouterOutput, RouterResult } from "./claude.js";

const CONFIDENCE_THRESHOLD = 0.7;

export async function classify(
  sender: "jeremy" | "partner",
  chatId: number,
  message: string,
): Promise<RouterResult> {
  const result = await invokeClaude({
    agent: "router",
    prompt: `sender: ${sender}\nchat_id: ${chatId}\nmessage: ${message}`,
    timeoutMs: 15_000,
  });

  if (result.exitCode !== 0) return fallback(`router exit ${result.exitCode}`);
  const parsed = parseRouterOutput(result.stdout);
  if (!parsed) return fallback(`unparseable: ${result.stdout.slice(0, 200)}`);

  if (parsed.confidence < CONFIDENCE_THRESHOLD && parsed.intent !== "unclear") {
    return {
      intent: "unclear",
      confidence: parsed.confidence,
      fields: { guess: parsed.intent },
      reply: "Not quite sure — can you rephrase? Tip: /help shows what I can do.",
    };
  }
  return parsed;
}

function fallback(reason: string): RouterResult {
  console.error("[router]", reason);
  return {
    intent: "unclear",
    confidence: 0,
    fields: { error: reason },
    reply: "Something went wrong on my end. Try again in a sec?",
  };
}
```

### `src/index.ts`

```typescript
import { Bot, Context } from "grammy";
import { classify } from "./router.js";
import { invokeClaude } from "./claude.js";
import { handleCrud } from "./handlers/crud.js";
import { handleCalendar } from "./handlers/calendar.js";
import { handleReminder } from "./handlers/reminder.js";
import "dotenv/config";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);

const ALLOWED = new Set([
  Number(process.env.TG_USER_JEREMY),
  Number(process.env.TG_USER_PARTNER),
]);

function senderOf(ctx: Context): "jeremy" | "partner" | null {
  const id = ctx.from?.id;
  if (!id || !ALLOWED.has(id)) return null;
  return id === Number(process.env.TG_USER_JEREMY) ? "jeremy" : "partner";
}

bot.command("help", ctx => ctx.reply(HELP_TEXT));
bot.command("today", async ctx => {
  ctx.reply(await handleCalendar({ intent: "calendar_read", fields: { range: "today" } } as any));
});
// ... other slash commands

bot.on("message:text", async ctx => {
  const sender = senderOf(ctx);
  if (!sender) return;
  const text = ctx.message.text;
  if (text.startsWith("/")) return;

  const cls = await classify(sender, ctx.chat.id, text);
  console.log(`[router] ${sender}: ${cls.intent} (${cls.confidence})`);

  switch (cls.intent) {
    case "chitchat":
    case "unclear":
      return ctx.reply(cls.reply ?? "ok");
    case "crud_write":
    case "crud_read":
      return ctx.reply(await handleCrud(cls, sender));
    case "calendar_add":
    case "calendar_read":
    case "calendar_update":
    case "calendar_delete":
      return ctx.reply(await handleCalendar(cls));
    case "reminder_add":
      return ctx.reply(await handleReminder(cls));
    case "needs_reasoning":
      return escalateToReasoner(ctx, sender, text);
  }
});

async function escalateToReasoner(ctx: Context, sender: string, text: string) {
  await ctx.replyWithChatAction("typing");
  const result = await invokeClaude({
    agent: "reasoner",
    prompt: `sender: ${sender}\nmessage: ${text}`,
    continueChat: true,
    timeoutMs: 90_000,
  });
  if (result.exitCode === 0 && result.stdout.trim()) {
    await ctx.reply(result.stdout.trim());
  } else {
    await ctx.reply("Hit a snag thinking that through — try again?");
    console.error("[reasoner]", result.stderr);
  }
}

const HELP_TEXT = `Digital Parent commands:
/today — what's on today
/week — what's on this week
/ask <q> — think about something
/log <thing> — log a fact
/event <text> — add to calendar
/remind <text> — add a reminder
/sync — start weekly sync now
/feedback — how am I doing
Or just talk to me normally.`;

bot.start();
console.log("digital parent bot up");
```

### `src/state.ts`

```typescript
import Database from "better-sqlite3";
import path from "node:path";

const db = new Database(path.join("/opt/digital-parent/data", "state.db"));
db.exec(`
  CREATE TABLE IF NOT EXISTS chat_sessions (
    telegram_chat_id INTEGER PRIMARY KEY,
    reasoner_session_id TEXT,
    last_activity_at INTEGER
  );
`);

export function getOrCreateSession(chatId: number) {
  let row = db.prepare("SELECT reasoner_session_id FROM chat_sessions WHERE telegram_chat_id = ?")
    .get(chatId) as { reasoner_session_id: string | null } | undefined;
  if (!row) {
    db.prepare("INSERT INTO chat_sessions (telegram_chat_id, last_activity_at) VALUES (?, ?)")
      .run(chatId, Date.now());
    row = { reasoner_session_id: null };
  }
  return { reasonerSessionId: row.reasoner_session_id ?? undefined };
}

export function recordSessionId(chatId: number, sessionId: string) {
  db.prepare("UPDATE chat_sessions SET reasoner_session_id = ?, last_activity_at = ? WHERE telegram_chat_id = ?")
    .run(sessionId, Date.now(), chatId);
}
```

### `package.json`

```json
{
  "name": "digital-parent-bot",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts"
  },
  "dependencies": {
    "better-sqlite3": "^11.3.0",
    "dotenv": "^16.4.5",
    "grammy": "^1.30.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^22.7.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

---

## Environment variables (.env)

```
TELEGRAM_BOT_TOKEN=...
TG_USER_JEREMY=...      # numeric Telegram user ID
TG_USER_PARTNER=...     # numeric Telegram user ID
TG_CHAT_ID=...          # the group chat ID (for cron jobs to post)
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REFRESH_TOKEN=...
VAULT_PATH=/opt/digital-parent/vault
```

`.env` should be `chmod 600` and gitignored.

---

## Milestones (build order)

**M1 — Pi hardening + remote access** *(deferred — Pi model TBC)*
- OS install, SSH lockdown, UFW, fail2ban, Tailscale, no public exposure

**M2 — Telegram echo loop**
- Bot via BotFather, grammy listener, systemd service, sender allowlist, echo with sender tag

**M3 — Single-shot Claude in the loop**
- `claude.ts` wrapper, basic Sonnet call on every message, conversation continuity via `--continue`
- Exit: ask a question, get a sensible reply with short-term memory

**M3.5 — Intent router + slash commands**
- Write `.claude/agents/router.md`
- `src/router.ts` parsing logic with fallbacks
- Slash command handlers
- Confidence threshold + unclear fallback
- Exit: "log baby weighed 7.2kg" routes to CRUD, "what do you think about X" routes to reasoner

**M3.6 — Caveman applied internally**
- Install caveman-shrink for MCP descriptions
- Run caveman-compress on router system prompt
- Verify no impact on Telegram-facing output

**M4 — Vault as memory**
- Seed `/vault/` structure with kids profiles, household, reminders
- Filesystem MCP wired
- `handlers/crud.ts` for plain-code reads/writes
- Exit: "what size shoes does toddler wear" works; "log baby weighed 7.2kg today" appends correctly

**M5 — Google Calendar**
- OAuth flow, refresh token stored in `.env`
- Google Calendar MCP wired
- `handlers/calendar.ts` for add/read/update/delete
- Conflict detection
- Sender tagged in event description
- Exit: "add dentist Tuesday 10am for toddler" creates real event visible on both phones

**M6 — Voice notes**
- `whisper.cpp` installed on Pi
- grammy voice handler → download OGG → transcribe → feed into same router pipeline
- Exit: dictate while holding baby, action happens

**M7 — Daily morning brief**
- `scripts/morning-brief.sh` calls `claude -p --agent reasoner` with a brief-generating prompt
- systemd timer at 7am AEST
- Posts to Telegram via `src/telegram.ts` helper
- Exit: useful daily brief lands without prompting

**M8 — Weekly sync (Opus)**
- Write `.claude/agents/weekly-sync.md`
- `scripts/weekly-sync.sh` orchestrates: post opening, listen for replies via bot, drive conversation, write `/vault/syncs/YYYY-WW.md`, post synthesis
- systemd timer Sunday 7pm AEST
- Sunday EOD check + Monday 8am continuation logic
- Exit: Sunday evening runs end-to-end, vault gets a note, group gets a useful summary

**M9 — Backups**
- rclone configured with encrypted Google Drive remote
- `scripts/backup.sh` rsyncs vault + state.db nightly
- Lifecycle: keep 30 daily, 12 monthly
- Test restore
- Exit: Pi could die tomorrow, nothing lost

**M10 — Polish & iterate**
- Photo handling
- Shopping list (Woolworths automation?)
- Meal planning honouring wheat/dairy/egg-free
- Recurring event templates
- Tune weekly sync questions after a month of real use
- Session summarisation when context grows large

---

## Cost picture

- Pi power: ~AUD $15/year
- rclone Google Drive: free (15GB tier, vault is megabytes)
- Telegram, Tailscale, Whisper local, Google Calendar: free
- Claude usage: under Claude Pro plan (Claude Code headless). Caveman reduces input tokens further. Weekly Opus sync is the heaviest single call.
- One-off: SSD (if not bought)

---

## Out of scope

- Real estate automation (separate project)
- Work integrations (Jira, GitHub)
- Web UI
- Multi-family
- Local LLM hosting
- LLM fine-tuning

---

## How to use this document with Claude Code

1. Drop this file as `DIGITAL_PARENT.md` in the project root
2. Also create a `CLAUDE.md` that points to it (`See @DIGITAL_PARENT.md for full project context`)
3. Start with M2 (the Telegram echo loop) — smallest end-to-end slice
4. Build one milestone at a time; don't try to do M3.5 before M3 works
5. Update this file's "Locked decisions" section as new decisions land
6. Update milestone status as you go (✓ done, ▶ in progress)
