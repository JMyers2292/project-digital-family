// Escalate handler — invokes the Sonnet reasoner subagent.

import { type ClaudeClient } from "../claude.js";

const SONNET = "claude-sonnet-4-6";

export async function handleEscalate(
  claude: ClaudeClient,
  sender: string,
  message: string,
): Promise<string> {
  const result = await claude.invoke({
    model: SONNET,
    agent: "reasoner",
    prompt: `${sender}: ${message}`,
    continueChat: true,
    timeoutMs: 180_000,
  });

  if (result.exitCode === 0 && result.text) {
    console.log(`[reasoner] model=${SONNET} reply in ${result.durationMs}ms:\n${result.text}\n`);
    return result.text;
  }

  console.error(`[reasoner] exit=${result.exitCode} stderr=${result.stderr.slice(0, 300)}`);
  return "Hit a snag thinking that through — try again in a sec?";
}
