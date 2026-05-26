import { spawn } from "node:child_process";

export type ClaudeInvocation = {
  agent?: "router" | "reasoner" | "weekly-sync";
  model?: string;
  prompt: string;
  sessionId?: string;
  continueChat?: boolean;
  timeoutMs?: number;
};

export type ClaudeResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
};

export async function invokeClaude(
  projectRoot: string,
  opts: ClaudeInvocation,
): Promise<ClaudeResult> {
  const args: string[] = ["-p"];
  if (opts.model) args.push("--model", opts.model);
  if (opts.agent) args.push("--agent", opts.agent);
  if (opts.sessionId) args.push("--resume", opts.sessionId);
  else if (opts.continueChat) args.push("--continue");

  const timeout = opts.timeoutMs ?? 60_000;
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn("claude", args, {
      cwd: projectRoot,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
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
      resolve({ stdout, stderr, exitCode: code ?? -1, durationMs: Date.now() - start });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.stdin.write(opts.prompt);
    child.stdin.end();
  });
}
