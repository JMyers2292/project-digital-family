import { type ClaudeClient } from "../claude.js";
import { getSyncSession, setSyncSession, clearSyncSession } from "../state.js";

// Claude signals the end of the sync by including this marker in its final message.
// Defined in .claude/agents/weekly-sync.md — must match exactly.
const SYNC_DONE_MARKER = "SYNC_DONE";

const OPUS = "claude-opus-4-8";

export async function startWeeklySync(claude: ClaudeClient, dataPath: string): Promise<string> {
  // Clear any stale session before starting
  clearSyncSession(dataPath);

  const result = await claude.invoke({
    agent: "weekly-sync",
    model: OPUS,
    prompt: "Start the weekly family sync. Post your opening message and ask the first question.",
    timeoutMs: 120_000,
  });

  if (result.exitCode !== 0 || !result.text.trim()) {
    throw new Error(
      `weekly sync start failed (exit ${result.exitCode}): ${result.stderr.slice(0, 200)}`,
    );
  }

  setSyncSession(dataPath, {
    startedAt: Date.now(),
    lastActivityAt: Date.now(),
    questionCount: 1,
    status: "active",
  });

  return result.text.trim();
}

export async function continueWeeklySync(
  claude: ClaudeClient,
  dataPath: string,
  senderName: string,
  message: string,
): Promise<{ response: string; isComplete: boolean }> {
  const session = getSyncSession(dataPath);
  if (!session || session.status !== "active") {
    return { response: "Weekly sync isn't running at the moment.", isComplete: false };
  }

  const result = await claude.invoke({
    agent: "weekly-sync",
    model: OPUS,
    prompt: `${senderName}: ${message}`,
    continueChat: true,
    timeoutMs: 120_000,
  });

  if (result.exitCode !== 0) {
    throw new Error(
      `weekly sync continue failed (exit ${result.exitCode}): ${result.stderr.slice(0, 200)}`,
    );
  }

  const rawResponse = result.text.trim();
  const isComplete = rawResponse.includes(SYNC_DONE_MARKER);
  const response = rawResponse.replace(SYNC_DONE_MARKER, "").trim();

  if (isComplete) {
    clearSyncSession(dataPath);
  } else {
    setSyncSession(dataPath, {
      ...session,
      lastActivityAt: Date.now(),
      questionCount: session.questionCount + 1,
    });
  }

  return { response, isComplete };
}
