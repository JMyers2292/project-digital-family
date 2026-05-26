export type Config = {
  telegramBotToken: string;
  partner1Id: number;
  partner2Id: number;
  chatId: number | null;
  projectRoot: string;
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

  // On the Pi this should be /opt/digital-parent; locally defaults to cwd
  const projectRoot = process.env.PROJECT_ROOT ?? process.cwd();

  return { telegramBotToken, partner1Id, partner2Id, chatId, projectRoot };
}
