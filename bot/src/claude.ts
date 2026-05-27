// Shared types and the ClaudeClient interface.
// To swap implementations, create a class that implements ClaudeClient
// and pass it into DigitalParentBot in index.ts.

export type ClaudeInvocation = {
  agent?: "router" | "reasoner" | "weekly-sync";
  model?: string;
  prompt: string;
  sessionId?: string;
  continueChat?: boolean;
  timeoutMs?: number;
};

export type ClaudeResult = {
  /** The assistant's response text */
  text: string;
  /** Raw stderr output — populated by ClaudeCodeClient, empty for SDK client */
  stderr: string;
  /** Exit code — 0 on success; populated by ClaudeCodeClient, always 0 for SDK client */
  exitCode: number;
  durationMs: number;
};

export interface ClaudeClient {
  invoke(opts: ClaudeInvocation): Promise<ClaudeResult>;
}
