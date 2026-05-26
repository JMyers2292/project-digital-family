# Developer Guide

Reference for working on the Digital Parent codebase. For the full product spec and milestone plan, see [DIGITAL_PARENT.md](../DIGITAL_PARENT.md).

---

## Contents

- [Module map](#module-map)
- [Environment variables](#environment-variables)
- [Swapping the Claude client](#swapping-the-claude-client)
- [Adding a new message handler](#adding-a-new-message-handler)
- [Development workflow](#development-workflow)
- [Local vs Pi differences](#local-vs-pi-differences)

---

## Module map

```
bot/src/
├── index.ts              Entry point. Loads config, wires dependencies, starts the bot.
├── config.ts             Reads and validates all environment variables. Fails fast on missing values.
├── bot.ts                DigitalParentBot class. Registers grammy handlers, dispatches to the AI client.
├── claude.ts             ClaudeClient interface + shared types (ClaudeInvocation, ClaudeResult).
├── claude-code-client.ts ClaudeCodeClient — current implementation via child_process.spawn + claude -p.
└── handlers/             (added per milestone) One file per intent: crud.ts, calendar.ts, reminder.ts
```

**Dependency direction**: `index.ts` → `config.ts` + `claude-code-client.ts` → `bot.ts` → `claude.ts` (interface only).
`bot.ts` never imports a concrete client — only the interface. This is intentional; see [Swapping the Claude client](#swapping-the-claude-client).

---

## Environment variables

Defined in `.env` (gitignored). Copy `.env.example` to get started.

| Variable | Required | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from @BotFather |
| `TG_USER_1` | Yes | Numeric Telegram user ID for Partner 1 (message @userinfobot to find) |
| `TG_USER_2` | Yes | Numeric Telegram user ID for Partner 2 |
| `TG_CHAT_ID` | M7+ | Group chat ID — appears in logs on first message (`chat_id=...`) |
| `PROJECT_ROOT` | Pi only | Absolute path to the project root. Defaults to `cwd`. Set to `/opt/digital-parent` on the Pi. |
| `GOOGLE_OAUTH_CLIENT_ID` | M5+ | Google Calendar OAuth credentials |
| `GOOGLE_OAUTH_CLIENT_SECRET` | M5+ | Google Calendar OAuth credentials |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | M5+ | Google Calendar OAuth credentials |
| `VAULT_PATH` | M4+ | Absolute path to the Obsidian vault. Defaults to `{PROJECT_ROOT}/vault` |

---

## Swapping the Claude client

The bot depends on the `ClaudeClient` interface (`src/claude.ts`), not any concrete implementation. To switch from Claude Code headless (`claude -p`) to the Anthropic SDK — or any other backend — follow these steps:

### 1. Create a new client class

Create `bot/src/anthropic-sdk-client.ts` (or similar) implementing the interface:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { type ClaudeClient, type ClaudeInvocation, type ClaudeResult } from "./claude.js";

export class AnthropicSdkClient implements ClaudeClient {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async invoke(opts: ClaudeInvocation): Promise<ClaudeResult> {
    const start = Date.now();

    const response = await this.client.messages.create({
      model: opts.model ?? "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: opts.prompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    return {
      text,
      stderr: "",
      exitCode: 0,
      durationMs: Date.now() - start,
    };
  }
}
```

> **Note**: The SDK client ignores `continueChat`, `sessionId`, and `agent` — those are Claude Code concepts. Session continuity via the SDK requires managing conversation history yourself (pass prior messages in the `messages` array). That's a later concern.

### 2. Update index.ts — one line

```typescript
// Before (Claude Code headless)
import { ClaudeCodeClient } from "./claude-code-client.js";
const claude = new ClaudeCodeClient(config.projectRoot);

// After (Anthropic SDK)
import { AnthropicSdkClient } from "./anthropic-sdk-client.js";
const claude = new AnthropicSdkClient(process.env.ANTHROPIC_API_KEY!);
```

Everything else — `bot.ts`, handlers, config — stays untouched.

### 3. Install the SDK

```bash
cd bot
npm install @anthropic-ai/sdk
```

### Interface contract

Any `ClaudeClient` implementation must satisfy:

```typescript
interface ClaudeClient {
  invoke(opts: ClaudeInvocation): Promise<ClaudeResult>;
}

// ClaudeResult fields:
// text       — the assistant's response (required)
// stderr     — error output if any (empty string if not applicable)
// exitCode   — 0 on success, non-zero on failure (always 0 for SDK)
// durationMs — wall-clock time for the call
```

---

## Adding a new message handler

Handlers live in `bot/src/handlers/`. Each file owns one intent (e.g. `crud.ts` for vault reads/writes, `calendar.ts` for calendar operations).

**Steps:**

1. Create `bot/src/handlers/your-handler.ts` and export a single async function:

```typescript
import { type RouterResult } from "../claude.js";

export async function handleYourIntent(cls: RouterResult, sender: string): Promise<string> {
  // do the work
  return "Reply to send back to Telegram";
}
```

2. Import and call it in `bot.ts` inside `onTextMessage` (or the relevant handler method):

```typescript
import { handleYourIntent } from "./handlers/your-handler.js";

// inside the dispatch switch:
case "your_intent":
  await ctx.reply(await handleYourIntent(cls, name));
  break;
```

3. Keep handlers free of grammy types — they receive plain data and return a string. This makes them independently testable.

---

## Development workflow

1. Branch from `main`: `git checkout -b feat/your-feature`
2. Make changes, run `npx tsc --noEmit` to check types before committing
3. Commit with conventional prefixes: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`
4. Push and open a PR against `main`
5. Merge via GitHub — direct pushes to `main` are protected

**Useful commands:**

```bash
# Type-check without building
cd bot && npx tsc --noEmit

# Run with auto-reload
cd bot && npm run dev

# Build for production
cd bot && npm run build
```

---

## Local vs Pi differences

| | Local dev | Raspberry Pi |
|---|---|---|
| `PROJECT_ROOT` | Leave blank (defaults to `cwd`) | `/opt/digital-parent` |
| `VAULT_PATH` | Any local path | `/opt/digital-parent/vault` |
| Process management | `npm run dev` | systemd service |
| Claude Code | Must be installed and authenticated locally | Installed at `/opt/digital-parent` |
| `.env` location | `bot/.env` | `bot/.env`, `chmod 600` |

When deploying to the Pi, copy `bot/.env` across via `scp` over Tailscale — never commit it.
