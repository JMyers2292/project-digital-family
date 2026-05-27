// CRUD handler — plain code, no LLM.
// Reads and writes to the Obsidian vault (markdown files).
// Vault path comes from config; wired up in M4.

import { type RouterResult } from "../router.js";

export function handleCrudWrite(result: RouterResult): string {
  const { subject, attribute, value, unit, date } = result.fields as Record<string, string>;
  const entry = `${date} ${attribute} ${value}${unit ? unit : ""} (logged by bot)`;
  console.log(`[crud] write subject=${subject} entry="${entry}"`);
  // TODO M4: append to /vault/kids/{subject}/measurements.md or health.md
  return `Got it — logged ${attribute} ${value}${unit ? unit : ""} for ${subject}.`;
}

export function handleCrudRead(result: RouterResult): string {
  const { subject, attribute } = result.fields as Record<string, string>;
  console.log(`[crud] read subject=${subject} attribute=${attribute}`);
  // TODO M4: read from vault and return the value
  return `Vault reads coming in M4 — can't look that up just yet.`;
}
