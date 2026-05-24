import { Bot, Context } from "grammy";
import { type Config } from "./config.js";

export class DigitalParentBot {
  private readonly bot: Bot;
  private readonly allowed: Map<number, string>;

  constructor(config: Config) {
    this.bot = new Bot(config.telegramBotToken);
    this.allowed = new Map([
      [config.partner1Id, "Partner"],
      [config.partner2Id, "Partner"],
    ]);
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
    console.log(`[bot] ${name}: ${text}`);
    await ctx.reply(`${name} said: ${text}`);
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
