// Artifact handler — generates a formatted file and sends it as a Telegram document.
// Supported formats: html, csv, md, txt.
// The file is written to a temp path, sent, then deleted.

import { Context, InputFile } from "grammy";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ClaudeClient } from "../claude.js";
import { type ArtifactFields } from "../router.js";

const SONNET = "claude-sonnet-4-6";

const MIME_TYPES: Record<string, string> = {
  html: "text/html",
  csv: "text/csv",
  md: "text/markdown",
  txt: "text/plain",
};

export async function handleArtifact(
  ctx: Context,
  claude: ClaudeClient,
  sender: string,
  originalMessage: string,
  fields: ArtifactFields,
): Promise<void> {
  const { format, description, filename } = fields;

  const prompt =
    `[ARTIFACT format=${format} filename=${filename}]\n` +
    `${sender}: ${originalMessage}\n\n` +
    `Produce a ${format.toUpperCase()} artifact for: ${description}`;

  console.log(`[artifact] format=${format} filename=${filename}`);

  const result = await claude.invoke({
    model: SONNET,
    agent: "reasoner",
    prompt,
    timeoutMs: 120_000,
  });

  if (result.exitCode !== 0 || !result.text) {
    console.error(`[artifact] exit=${result.exitCode} stderr=${result.stderr.slice(0, 300)}`);
    await ctx.reply("Couldn't generate that — try again in a sec?");
    return;
  }

  const tmpPath = join(tmpdir(), `dp-${Date.now()}-${filename}`);

  try {
    await writeFile(tmpPath, result.text, "utf8");

    const mime = MIME_TYPES[format] ?? "application/octet-stream";
    await ctx.replyWithDocument(new InputFile(tmpPath, filename), {
      caption: `Here's your ${description}.`,
    });

    console.log(`[artifact] sent ${filename} (${mime}) in ${result.durationMs}ms`);
  } finally {
    await unlink(tmpPath).catch(() => {
      // Best-effort cleanup — don't throw if already gone
    });
  }
}
