import "dotenv/config";
import { Bot, Context } from "grammy";

// --- Config & allowlist ---

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error("[bot] TELEGRAM_BOT_TOKEN is not set — check your .env");
  process.exit(1);
}

const PARTNER_1_ID = Number(process.env.TG_USER_1);
const PARTNER_2_ID = Number(process.env.TG_USER_2);

if (!PARTNER_1_ID || !PARTNER_2_ID) {
  console.error("[bot] TG_USER_1 and TG_USER_2 must both be set — check your .env");
  process.exit(1);
}

const ALLOWED: Map<number, string> = new Map([
  [PARTNER_1_ID, "Partner"],
  [PARTNER_2_ID, "Partner"],
]);

// --- Bot setup ---

const bot = new Bot(TOKEN);

function senderName(ctx: Context): string | null {
  const id = ctx.from?.id;
  if (!id) return null;
  return ALLOWED.get(id) ?? null;
}

bot.on("message:text", async (ctx) => {
  const name = senderName(ctx);
  if (!name) {
    // Silently ignore messages from anyone not in the allowlist
    console.log(`[bot] ignored message from unknown user ${ctx.from?.id ?? "?"}`);
    return;
  }

  const text = ctx.message.text;
  console.log(`[bot] ${name}: ${text}`);
  await ctx.reply(`${name} said: ${text}`);
});

// --- Start ---

bot.start({
  onStart: () => console.log("[bot] digital parent bot up"),
});
