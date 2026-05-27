// ClaudeCodeClient — invokes `claude -p` via child_process.spawn.
// Swap this out for AnthropicSdkClient (or similar) in index.ts
// without touching anything else.

import { spawn } from "node:child_process";
import { type ClaudeClient, type ClaudeInvocation, type ClaudeResult } from "./claude.js";

export class ClaudeCodeClient implements ClaudeClient {
  constructor(
    private readonly projectRoot: string,
    private readonly claudeBin: string = "claude",
  ) {}

  async invoke(opts: ClaudeInvocation): Promise<ClaudeResult> {
    // Prompt is passed as a positional argument — more reliable than stdin
    // in non-interactive/containerised environments.
    const args: string[] = ["-p", opts.prompt];
    if (opts.model) args.push("--model", opts.model);
    if (opts.agent) args.push("--agent", opts.agent);
    if (opts.sessionId) args.push("--resume", opts.sessionId);
    else if (opts.continueChat) args.push("--continue");

    const timeout = opts.timeoutMs ?? 60_000;
    const start = Date.now();

    // On Windows, .cmd wrappers (how npm installs CLI binaries) require
    // shell: true to be executable via spawn. Has no effect on Linux/Pi.
    const isWindows = process.platform === "win32";

    return new Promise((resolve, reject) => {
      const child = spawn(this.claudeBin, args, {
        cwd: this.projectRoot,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
        shell: isWindows,
      });

      let stdout = "";
      let stderr = "";

      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`claude timed out after ${timeout}ms`));
      }, timeout);

      child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
      child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          text: stdout.trim(),
          stderr,
          exitCode: code ?? -1,
          durationMs: Date.now() - start,
        });
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}
