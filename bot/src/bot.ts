import { Bot, Context } from "grammy";
import { type Config } from "./config.js";
import { type ClaudeClient } from "./claude.js";

const SONNET = "claude-sonnet-4-6";

export class DigitalParentBot {
  private readonly bot: Bot;
  private readonly allowed: Map<number, string>;
  private readonly claude: ClaudeClient;

  constructor(config: Config, claude: ClaudeClient) {
    this.bot = new Bot(config.telegramBotToken);
    this.allowed = new Map([
      [config.partner1Id, "Partner"],
      [config.partner2Id, "Partner"],
    ]);
    this.claude = claude;
    this.registerHandlers();
  }

  // -- Handlers --

  private onTextMessage = async (ctx: Context): Promise<void> => {
    const name = this.senderName(ctx);
    if (!name) {
      console.log(`[bot] ignored message from unknown user ${ctx.from?.id ?? "?"}`);
      return;
    }

    const text = ctx.message?.text ?? "";
    const chatId = ctx.chat?.id;
    console.log(`[bot] chat_id=${chatId} ${name}: ${text}`);

    await ctx.replyWithChatAction("typing");

    try {
      const result = await this.claude.invoke({
        model: SONNET,
        prompt: `${name}: ${text}`,
        continueChat: true,
        timeoutMs: 60_000,
      });

      if (result.exitCode === 0 && result.text) {
        console.log(`[claude] reply in ${result.durationMs}ms`);
        await ctx.reply(result.text);
      } else {
        console.error(`[claude] exit=${result.exitCode} stderr=${result.stderr.slice(0, 200)}`);
        await ctx.reply("Hit a snag — try again in a sec?");
      }
    } catch (err) {
      console.error("[claude] error:", err);
      await ctx.reply("Hit a snag — try again in a sec?");
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
    this.bot.on("message:text", this.onTextMessage);
  }

  start(): void {
    this.bot.start({
      onStart: () => console.log("[bot] digital parent bot up"),
    });
  }
}
