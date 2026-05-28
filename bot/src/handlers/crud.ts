// CRUD handler — plain code reads/writes to the Obsidian vault (markdown files).
// No LLM involved. Append-only for measurements, health, milestones, reminders.

import { appendFile, readFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { type RouterResult } from "../router.js";

// Attributes that append to measurements.md
const MEASUREMENT_ATTRS = new Set(["weight", "height", "head circumference", "length"]);

// Attributes that append to health.md
const HEALTH_ATTRS = new Set([
  "appointment",
  "illness",
  "medication",
  "temperature",
  "fever",
  "vaccine",
  "vaccination",
  "observation",
]);

// Attributes that append to milestones.md
const MILESTONE_ATTRS = new Set([
  "milestone",
  "first",
  "walked",
  "talked",
  "word",
  "tooth",
  "teeth",
  "crawled",
  "rolled",
  "sat",
]);

function resolveKidDir(vaultPath: string, subject: string): string | null {
  const s = subject.toLowerCase().trim();
  if (s === "child-1" || s === "child1" || s === "toddler" || s === "kid1") {
    return join(vaultPath, "kids", "child-1");
  }
  if (s === "child-2" || s === "child2" || s === "baby" || s === "kid2") {
    return join(vaultPath, "kids", "child-2");
  }
  return null;
}

function resolveWriteFile(kidDir: string, attribute: string): string {
  const attr = attribute.toLowerCase().trim();
  if (MEASUREMENT_ATTRS.has(attr)) return join(kidDir, "measurements.md");
  if (HEALTH_ATTRS.has(attr)) return join(kidDir, "health.md");
  if (MILESTONE_ATTRS.has(attr)) return join(kidDir, "milestones.md");
  return join(kidDir, "health.md"); // default for unknown attributes
}

function formatEntry(fields: Record<string, string>, sender: string): string {
  const { date, attribute, value, unit } = fields;
  const unitStr = unit ? unit : "";
  return `${date} ${attribute} ${value}${unitStr} (logged by ${sender})\n`;
}

export async function handleCrudWrite(
  result: RouterResult,
  vaultPath: string,
  sender: string,
): Promise<string> {
  const fields = result.fields as Record<string, string>;
  const { subject, attribute, value, unit, date } = fields;

  // Household write — append to household/notes.md
  if (subject?.toLowerCase() === "household") {
    const filePath = join(vaultPath, "household", "notes.md");
    const entry = formatEntry(fields, sender);
    await ensureAndAppend(filePath, entry);
    console.log(`[crud] write household/${attribute}`);
    return `Got it — logged "${attribute}: ${value}${unit ? unit : ""}" to household notes.`;
  }

  const kidDir = resolveKidDir(vaultPath, subject);
  if (!kidDir) {
    return `Not sure who "${subject}" is — try using "child-1", "child-2", "toddler", or "baby".`;
  }

  const filePath = resolveWriteFile(kidDir, attribute);
  const entry = formatEntry(fields, sender);
  await ensureAndAppend(filePath, entry);

  console.log(`[crud] write ${filePath}`);
  return `Got it — logged ${attribute} ${value}${unit ? unit : ""} for ${subject} on ${date}.`;
}

export async function handleCrudRead(result: RouterResult, vaultPath: string): Promise<string> {
  const { subject, attribute } = result.fields as Record<string, string>;

  if (subject?.toLowerCase() === "household") {
    const content = await safeRead(join(vaultPath, "household", "notes.md"));
    return content ? `Household notes:\n${content}` : "Nothing logged for the household yet.";
  }

  const kidDir = resolveKidDir(vaultPath, subject);
  if (!kidDir) {
    return `Not sure who "${subject}" is — try using "child-1", "child-2", "toddler", or "baby".`;
  }

  // Check profile first for static facts, then measurements for logged values
  const profileContent = await safeRead(join(kidDir, "profile.md"));
  const measurementsContent = await safeRead(join(kidDir, "measurements.md"));

  const attr = attribute?.toLowerCase().trim() ?? "";

  // Search measurements log for the attribute
  if (measurementsContent) {
    const lines = measurementsContent
      .split("\n")
      .filter((l) => l.toLowerCase().includes(attr) && !l.startsWith("#"));

    if (lines.length > 0) {
      const latest = lines[lines.length - 1];
      return `Last recorded ${attribute} for ${subject}: ${latest.trim()}`;
    }
  }

  // Fall back to profile
  if (profileContent) {
    const lines = profileContent
      .split("\n")
      .filter((l) => l.toLowerCase().includes(attr) && !l.startsWith("#"));

    if (lines.length > 0) {
      return `From ${subject}'s profile — ${lines[0].replace(/^-\s*/, "").trim()}`;
    }
  }

  return `Nothing recorded for "${attribute}" for ${subject} yet.`;
}

async function ensureAndAppend(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, content, "utf8");
}

async function safeRead(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}
