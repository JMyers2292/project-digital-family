import "dotenv/config";
import net from "node:net";
import { loadConfig } from "./config.js";
import { ClaudeCodeClient } from "./claude-code-client.js";
import { DigitalParentBot } from "./bot.js";

// Raspberry Pi (WiFi, no IPv6): Node.js 22 Happy Eyeballs causes TLS ETIMEDOUT.
// Set DISABLE_IPV6=true in .env to apply the fix. Safe no-op on dev machines.
if (process.env.DISABLE_IPV6 === "true") {
  net.setDefaultAutoSelectFamily(false);
}

const config = loadConfig();

// Swap ClaudeCodeClient for AnthropicSdkClient (or any ClaudeClient
// implementation) here without touching anything else.
const claude = new ClaudeCodeClient(config.projectRoot, config.claudeBin);

const bot = new DigitalParentBot(config, claude);
bot.start();
