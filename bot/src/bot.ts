import { Bot, Context } from "grammy";
import { type Config } from "./config.js";
import { type ClaudeClient } from "./claude.js";
import { Router } from "./router.js";
import { handleCrudWrite, handleCrudRead } from "./handlers/crud.js";
import { handleCalendar } from "./handlers/calendar.js";
import { handleReminder } from "./handlers/reminder.js";
import { handleEscalate } from "./handlers/escalate.js";
import { handleArtifact } from "./handlers/artifact.js";
import { type ArtifactFields } from "./router.js";

const HELP_TEXT = `Digital Parent commands:
/today — what's on today
/week — what's on this week
/ask <question> — think something through
/log <thing> — log a fact (e.g. /log baby weighed 5.4kg)
/event <text> — add to calendar (e.g. /event dentist Tuesday 10am)
/remind <text> — add a reminder
/kid <name> <thing> — quick log for a specific kid
/create <request> — generate a file (e.g. /create weekly menu as HTML)
/sync — start weekly sync now
/help — show this list

Or just talk to me normally.`;

export class DigitalParentBot {
  private readonly bot: Bot;
  private readonly allowed: Map<number, string>;
  private readonly claude: ClaudeClient;
  private readonly router: Router;
  private readonly vaultPath: string;

  constructor(config: Config, claude: ClaudeClient) {
    this.bot = new Bot(config.telegramBotToken);
    this.allowed = new Map([
      [config.partner1Id, "Partner 1"],
      [config.partner2Id, "Partner 2"],
    ]);
    this.claude = claude;
    this.router = new Router(claude);
    this.vaultPath = config.vaultPath;
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

  private onSync = async (ctx: Context): Promise<void> => {
    // TODO M8: trigger weekly sync agent
    await ctx.reply("Weekly sync coming in M8 — not wired up yet.");
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
    this.bot.command("sync", this.onSync);
    this.bot.command("create", this.onCreate);
    this.bot.on("message:text", this.onTextMessage);
  }

  start(): void {
    this.bot.start({
      onStart: () => console.log("[bot] digital parent bot up"),
    });
  }
}
