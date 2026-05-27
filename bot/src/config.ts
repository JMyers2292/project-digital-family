import path from "node:path";

export type Config = {
  telegramBotToken: string;
  partner1Id: number;
  partner2Id: number;
  chatId: number | null;
  projectRoot: string;
  dataPath: string;
  claudeBin: string;
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

  // Directory where state.db lives. Defaults to {projectRoot}/data.
  // On the Pi: /opt/digital-parent/data
  const dataPath = process.env.DATA_PATH ?? path.join(projectRoot, "data");

  // Path to the claude CLI binary. Defaults to "claude" (assumes it's on PATH).
  // Set CLAUDE_BIN to the full path if `claude` resolves to the wrong binary.
  // e.g. C:\Users\you\AppData\Roaming\npm\node_modules\.bin\claude
  const claudeBin = process.env.CLAUDE_BIN ?? "claude";

  return { telegramBotToken, partner1Id, partner2Id, chatId, projectRoot, dataPath, claudeBin };
}
