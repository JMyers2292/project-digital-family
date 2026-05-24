export type Config = {
  telegramBotToken: string;
  partner1Id: number;
  partner2Id: number;
  chatId: number | null;
};

export function loadConfig(): Config {
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!telegramBotToken) {
    console.error("[config] TELEGRAM_BOT_TOKEN is not set — check your .env");
    process.exit(1);
  }

  const partner1Id = Number(process.env.TG_USER_1);
  const partner2Id = Number(process.env.TG_USER_2);
  if (!partner1Id || !partner2Id) {
    console.error("[config] TG_USER_1 and TG_USER_2 must both be set — check your .env");
    process.exit(1);
  }

  const chatId = process.env.TG_CHAT_ID ? Number(process.env.TG_CHAT_ID) : null;

  return { telegramBotToken, partner1Id, partner2Id, chatId };
}
