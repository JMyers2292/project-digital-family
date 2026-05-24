import "dotenv/config";
import { loadConfig } from "./config.js";
import { DigitalParentBot } from "./bot.js";

const config = loadConfig();
const bot = new DigitalParentBot(config);
bot.start();
