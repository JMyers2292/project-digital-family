import { Bot, Context } from "grammy";
import { type Config } from "./config.js";
import { type ClaudeClient } from "./claude.js";
import { Router } from "./router.js";
import { handleCrudWrite, handleCrudRead } from "./handlers/crud.js";
import { handleCalendar } from "./handlers/calendar.js";
import { handleReminder } from "./handlers/reminder.js";
import { handleEscalate } from "./handlers/escalate.js";
import { handleArtifact } from "./handlers/artifact.js";
import { startWeeklySync, continueWeeklySync } from "./handlers/weekly-sync.js";
import { handleShoppingAdd, handleShoppingRead, handleShoppingClear } from "./handlers/shopping.js";
import { runBuildSteps, scheduleRestart } from "./handlers/update.js";
import { getSyncSession } from "./state.js";
import { type ArtifactFields } from "./router.js";

const HELP_TEXT = `Digital Parent commands:
/today — what's on today
/week — what's on this week
/ask <question> — think something through
/log <thing> — log a fact (e.g. /log baby weighed 5.4kg)
/event <text> — add to calendar (e.g. /event dentist Tuesday 10am)
/remind <text> — add a reminder
/kid <name> <thing> — quick log for a specific kid
/shop — view shopping list
/shop add <items> — add to shopping list
/shop clear — clear the list
/create <request> — generate a file (e.g. /create weekly menu as HTML)
/sync — start weekly sync now
/feedback — how am I doing
/update — pull latest code and restart
/help — show this list

Or just talk to me normally.`;

export class DigitalParentBot {
  private readonly bot: Bot;
  private readonly allowed: Map<number, string>;
  private readonly claude: ClaudeClient;
  private readonly router: Router;
  private readonly vaultPath: string;
  private readonly dataPath: string;
  private readonly projectRoot: string;

  constructor(config: Config, claude: ClaudeClient) {
    this.bot = new Bot(config.telegramBotToken);
    this.allowed = new Map([
      [config.partner1Id, "Partner 1"],
      [config.partner2Id, "Partner 2"],
    ]);
    this.claude = claude;
    this.router = new Router(claude);
    this.vaultPath = config.vaultPath;
    this.dataPath = config.dataPath;
    this.projectRoot = config.projectRoot;
    this.registerHandlers();
  }

  // -- Slash command handlers --

  private onHelp = async (ctx: Context): Promise<void> => {
    await ctx.reply(HELP_TEXT);
  };

  private onToday = async (ctx: Context): Promise<void> => {
    // TODO M5: read today's calendar events via Google Calendar MCP
    await ctx.reply("Calendar integration coming in M5 — can't show today's events just yet.");
  };

  private onWeek = async (ctx: Context): Promise<void> => {
    // TODO M5: read this week's calendar events via Google Calendar MCP
    await ctx.reply("Calendar integration coming in M5 — can't show the week just yet.");
  };

  private onAsk = async (ctx: Context): Promise<void> => {
    const name = this.senderName(ctx);
    if (!name) return;

    const question = ctx.match?.toString().trim();
    if (!question) {
      await ctx.reply("What would you like me to think about? e.g. /ask what should I do about X");
      return;
    }

    await ctx.replyWithChatAction("typing");
    const reply = await handleEscalate(this.claude, name, question);
    await ctx.reply(reply);
  };

  private onLog = async (ctx: Context): Promise<void> => {
    const name = this.senderName(ctx);
    if (!name) return;

    const text = ctx.match?.toString().trim();
    if (!text) {
      await ctx.reply("What would you like to log? e.g. /log baby weighed 5.4kg");
      return;
    }

    await ctx.replyWithChatAction("typing");
    const cls = await this.router.classify(name, text);
    if (cls.intent === "crud_write") {
      await ctx.reply(await handleCrudWrite(cls, this.vaultPath, name));
    } else {
      await ctx.reply("Not sure how to log that — try something like: /log baby weighed 5.4kg");
    }
  };

  private onEvent = async (ctx: Context): Promise<void> => {
    const name = this.senderName(ctx);
    if (!name) return;

    const text = ctx.match?.toString().trim();
    if (!text) {
      await ctx.reply("What event? e.g. /event dentist Tuesday 10am for toddler");
      return;
    }

    await ctx.replyWithChatAction("typing");
    const cls = await this.router.classify(name, `add event: ${text}`);
    if (cls.intent.startsWith("calendar_")) {
      await ctx.reply(handleCalendar(cls));
    } else {
      await ctx.reply("Couldn't parse that as an event — try: /event dentist Tuesday 10am");
    }
  };

  private onRemind = async (ctx: Context): Promise<void> => {
    const name = this.senderName(ctx);
    if (!name) return;

    const text = ctx.match?.toString().trim();
    if (!text) {
      await ctx.reply("What's the reminder? e.g. /remind call GP tomorrow");
      return;
    }

    await ctx.replyWithChatAction("typing");
    const cls = await this.router.classify(name, `remind me to ${text}`);
    if (cls.intent === "reminder_add") {
      await ctx.reply(await handleReminder(cls, this.vaultPath, name));
    } else {
      await ctx.reply(`Got it — noted: ${text}`);
    }
  };

  private onKid = async (ctx: Context): Promise<void> => {
    const name = this.senderName(ctx);
    if (!name) return;

    const text = ctx.match?.toString().trim();
    if (!text) {
      await ctx.reply("Usage: /kid toddler slept through the night");
      return;
    }

    await ctx.replyWithChatAction("typing");
    const cls = await this.router.classify(name, `log for kid: ${text}`);
    if (cls.intent === "crud_write") {
      await ctx.reply(await handleCrudWrite(cls, this.vaultPath, name));
    } else {
      await ctx.reply("Not sure how to log that.");
    }
  };

  private onShop = async (ctx: Context): Promise<void> => {
    const name = this.senderName(ctx);
    if (!name) return;

    const text = (ctx.match?.toString() ?? "").trim();

    if (!text || text === "list" || text === "show") {
      await ctx.reply(await handleShoppingRead(this.vaultPath));
      return;
    }

    if (text === "clear" || text === "done" || text === "empty") {
      await ctx.reply(await handleShoppingClear(this.vaultPath));
      return;
    }

    const itemText = text.replace(/^add\s+/i, "");
    const items = itemText
      .split(/[,\n]+/)
      .map((i) => i.trim())
      .filter(Boolean);
    if (items.length > 0) {
      await ctx.reply(await handleShoppingAdd(items, this.vaultPath));
    } else {
      await ctx.reply(
        "/shop — view list\n/shop add milk, bread — add items\n/shop clear — clear the list",
      );
    }
  };

  private onFeedback = async (ctx: Context): Promise<void> => {
    const name = this.senderName(ctx);
    if (!name) return;
    await ctx.replyWithChatAction("typing");
    const reply = await handleEscalate(
      this.claude,
      name,
      "Look at the vault to understand what's been logged about this family so far. Give me a short, honest take on how well I know them and what gaps are worth filling in — dietary info, routines, kids' profiles, anything missing that would help me be more useful day to day.",
    );
    await ctx.reply(reply);
  };

  private onUpdate = async (ctx: Context): Promise<void> => {
    const name = this.senderName(ctx);
    if (!name) return;

    await ctx.reply("Pulling latest changes and rebuilding — give me a minute...");

    const { success, summary } = await runBuildSteps(this.projectRoot);

    if (!success) {
      await ctx.reply(`Update failed — bot is still running the old version.\n\n${summary}`);
      return;
    }

    await ctx.reply(`Update complete. Restarting now — back in a few seconds.\n\n${summary}`);
    scheduleRestart("digital-parent-bot");
  };

  private onSync = async (ctx: Context): Promise<void> => {
    const name = this.senderName(ctx);
    if (!name) return;

    const existing = getSyncSession(this.dataPath);
    if (existing?.status === "active") {
      await ctx.reply("Weekly sync is already running — answer the question above, or keep going.");
      return;
    }

    await ctx.reply("Starting the weekly sync — give me a moment...");
    await ctx.replyWithChatAction("typing");

    try {
      const firstMessage = await startWeeklySync(this.claude, this.dataPath);
      await ctx.reply(firstMessage);
    } catch (err) {
      console.error("[sync] start failed:", err);
      await ctx.reply("Couldn't start the weekly sync — try again in a moment.");
    }
  };

  private onCreate = async (ctx: Context): Promise<void> => {
    const name = this.senderName(ctx);
    if (!name) return;

    const text = ctx.match?.toString().trim();
    if (!text) {
      await ctx.reply("What would you like me to create? e.g. /create a weekly menu as HTML");
      return;
    }

    await ctx.replyWithChatAction("upload_document");
    const cls = await this.router.classify(name, text);

    if (cls.intent === "artifact") {
      await handleArtifact(ctx, this.claude, name, text, cls.fields as ArtifactFields);
    } else {
      await handleArtifact(ctx, this.claude, name, text, {
        format: "txt",
        description: text,
        filename: "output.txt",
      });
    }
  };

  // -- Prose message handler --

  private onTextMessage = async (ctx: Context): Promise<void> => {
    const name = this.senderName(ctx);
    if (!name) {
      console.log(`[bot] ignored message from unknown user ${ctx.from?.id ?? "?"}`);
      return;
    }

    const text = ctx.message?.text ?? "";
    const chatId = ctx.chat?.id;
    console.log(`[bot] chat_id=${chatId} ${name}: ${JSON.stringify(text)}`);

    await ctx.replyWithChatAction("typing");

    // During an active weekly sync, route all messages to the sync session.
    const syncSession = getSyncSession(this.dataPath);
    if (syncSession?.status === "active") {
      try {
        const { response, isComplete } = await continueWeeklySync(
          this.claude,
          this.dataPath,
          name,
          text,
        );
        await ctx.reply(response);
        if (isComplete) {
          console.log("[sync] session complete");
        }
      } catch (err) {
        console.error("[sync] continue failed:", err);
        await ctx.reply("Something went wrong with the sync — try your reply again.");
      }
      return;
    }

    const cls = await this.router.classify(name, text);

    switch (cls.intent) {
      case "chitchat":
      case "unclear":
        await ctx.reply(cls.reply ?? "Not sure — try /help to see what I can do.");
        break;

      case "crud_write":
        await ctx.reply(await handleCrudWrite(cls, this.vaultPath, name));
        break;

      case "crud_read":
        await ctx.reply(await handleCrudRead(cls, this.vaultPath));
        break;

      case "calendar_add":
      case "calendar_read":
      case "calendar_update":
      case "calendar_delete":
        await ctx.reply(handleCalendar(cls));
        break;

      case "reminder_add":
        await ctx.reply(await handleReminder(cls, this.vaultPath, name));
        break;

      case "shopping_add": {
        const items = (cls.fields.items as string[] | undefined) ?? [];
        if (items.length > 0) {
          await ctx.reply(await handleShoppingAdd(items, this.vaultPath));
        } else {
          await ctx.reply(
            "What would you like me to add? e.g. add milk and bread to the shopping list",
          );
        }
        break;
      }

      case "shopping_read":
        await ctx.reply(await handleShoppingRead(this.vaultPath));
        break;

      case "shopping_clear":
        await ctx.reply(await handleShoppingClear(this.vaultPath));
        break;

      case "needs_reasoning":
        await ctx.reply(await handleEscalate(this.claude, name, text));
        break;

      case "artifact":
        await ctx.replyWithChatAction("upload_document");
        await handleArtifact(ctx, this.claude, name, text, cls.fields as ArtifactFields);
        break;
    }
  };

  // -- Helpers --

  private senderName(ctx: Context): string | null {
    const id = ctx.from?.id;
    if (!id) return null;
    return this.allowed.get(id) ?? null;
  }

  // -- Unsupported media handlers --

  private onVideo = async (ctx: Context): Promise<void> => {
    if (!this.senderName(ctx)) return;
    await ctx.reply("Can't look at videos I'm afraid — send me a text message instead.");
  };

  private onPhoto = async (ctx: Context): Promise<void> => {
    if (!this.senderName(ctx)) return;
    await ctx.reply(
      "Can't analyse photos just yet — the headless Claude CLI doesn't support image inputs. Send me a text description instead.",
    );
  };

  private onVoice = async (ctx: Context): Promise<void> => {
    if (!this.senderName(ctx)) return;
    await ctx.reply(
      "Voice notes aren't wired up yet — that's coming in M6 once whisper.cpp is on the Pi.",
    );
  };

  private onUnsupported = async (ctx: Context): Promise<void> => {
    if (!this.senderName(ctx)) return;
    await ctx.reply("Not sure what to do with that — try sending a text message.");
  };

  // -- Setup --

  private registerHandlers(): void {
    this.bot.command("help", this.onHelp);
    this.bot.command("today", this.onToday);
    this.bot.command("week", this.onWeek);
    this.bot.command("ask", this.onAsk);
    this.bot.command("log", this.onLog);
    this.bot.command("event", this.onEvent);
    this.bot.command("remind", this.onRemind);
    this.bot.command("kid", this.onKid);
    this.bot.command("shop", this.onShop);
    this.bot.command("feedback", this.onFeedback);
    this.bot.command("update", this.onUpdate);
    this.bot.command("sync", this.onSync);
    this.bot.command("create", this.onCreate);
    this.bot.on("message:text", this.onTextMessage);
    this.bot.on("message:video", this.onVideo);
    this.bot.on("message:video_note", this.onVideo);
    this.bot.on("message:photo", this.onPhoto);
    this.bot.on("message:voice", this.onVoice);
    this.bot.on("message:audio", this.onVoice);
    this.bot.on("message:sticker", this.onUnsupported);
    this.bot.on("message:document", this.onUnsupported);
  }

  start(): void {
    this.bot.catch((err) => {
      const ctx = err.ctx;
      console.error(`[bot] unhandled error on update ${ctx.update.update_id}:`, err.error);
      ctx.reply("Something went wrong on my end — try again in a moment.").catch(() => {});
    });
    this.bot.start({
      onStart: () => console.log("[bot] digital parent bot up"),
    });
  }
}
