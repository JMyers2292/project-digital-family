import { type ClaudeClient } from "./claude.js";

const HAIKU = "claude-haiku-4-5-20251001";
const CONFIDENCE_THRESHOLD = 0.7;

export type Intent =
  | "crud_write"
  | "crud_read"
  | "calendar_add"
  | "calendar_read"
  | "calendar_update"
  | "calendar_delete"
  | "reminder_add"
  | "shopping_add"
  | "shopping_read"
  | "shopping_clear"
  | "artifact"
  | "chitchat"
  | "needs_reasoning"
  | "unclear";

export type ArtifactFormat = "html" | "csv" | "md" | "txt";

export type ArtifactFields = {
  format: ArtifactFormat;
  description: string;
  filename: string;
};

export type RouterResult = {
  intent: Intent;
  confidence: number;
  fields: Record<string, unknown>;
  reply: string | null;
};

export class Router {
  constructor(private readonly claude: ClaudeClient) {}

  async classify(sender: string, message: string): Promise<RouterResult> {
    const result = await this.claude.invoke({
      model: HAIKU,
      agent: "router",
      prompt: `${sender}: ${message}`,
      timeoutMs: 60_000,
    });

    if (result.exitCode !== 0) {
      return this.fallback(`router exit=${result.exitCode} stderr=${result.stderr.slice(0, 200)}`);
    }

    const parsed = parseRouterOutput(result.text);
    if (!parsed) {
      return this.fallback(`unparseable output: ${result.text.slice(0, 200)}`);
    }

    console.log(`[router] intent=${parsed.intent} confidence=${parsed.confidence}`);

    if (parsed.confidence < CONFIDENCE_THRESHOLD && parsed.intent !== "unclear") {
      return {
        intent: "unclear",
        confidence: parsed.confidence,
        fields: { guess: parsed.intent },
        reply: "Not quite sure what you mean — can you rephrase? Try /help to see what I can do.",
      };
    }

    return parsed;
  }

  private fallback(reason: string): RouterResult {
    console.error("[router] fallback:", reason);
    return {
      intent: "unclear",
      confidence: 0,
      fields: { error: reason },
      reply: "Something went wrong on my end — try again in a sec?",
    };
  }
}

function parseRouterOutput(text: string): RouterResult | null {
  // Strip markdown code fences if present
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]) as RouterResult;
  } catch {
    return null;
  }
}
