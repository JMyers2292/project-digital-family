import "dotenv/config";
import { loadConfig } from "./config.js";
import { ClaudeCodeClient } from "./claude-code-client.js";
import { DigitalParentBot } from "./bot.js";

const config = loadConfig();

// Swap ClaudeCodeClient for AnthropicSdkClient (or any ClaudeClient
// implementation) here without touching anything else.
const claude = new ClaudeCodeClient(config.projectRoot);

const bot = new DigitalParentBot(config, claude);
bot.start();
