import { exec, spawn } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const BUILD_TIMEOUT_MS = 5 * 60 * 1000; // npm ci on a Pi can be slow

export type UpdateResult = {
  success: boolean;
  summary: string;
};

export async function runBuildSteps(projectRoot: string): Promise<UpdateResult> {
  try {
    const { stdout, stderr } = await execAsync(
      [
        `cd "${projectRoot}"`,
        "git fetch origin",
        "git reset --hard origin/main",
        "npm ci --prefix bot --silent",
        "npm run build --prefix bot --silent",
      ].join(" && "),
      { timeout: BUILD_TIMEOUT_MS },
    );
    const output = `${stdout}\n${stderr}`.trim();
    // Extract just the meaningful lines — skip npm noise
    const meaningful = output
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("npm warn") && !l.startsWith("npm notice"))
      .slice(0, 10)
      .join("\n");
    return { success: true, summary: meaningful || "Build complete." };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const output = `${e.stdout ?? ""}\n${e.stderr ?? ""}\n${e.message ?? ""}`.trim();
    return { success: false, summary: output.slice(0, 800) };
  }
}

// Fires systemctl restart after a short delay so the calling handler
// has time to send its reply before the process is replaced.
export function scheduleRestart(serviceName: string): void {
  setTimeout(() => {
    spawn("sudo", ["systemctl", "restart", serviceName], {
      detached: true,
      stdio: "ignore",
    }).unref();
  }, 1500);
}
