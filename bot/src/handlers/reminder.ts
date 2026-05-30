// Reminder handler — appends to vault reminders inbox.

import { appendFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { type RouterResult } from "../router.js";

export async function handleReminder(
  result: RouterResult,
  vaultPath: string,
  sender: string,
): Promise<string> {
  const { text, trigger_date } = result.fields as Record<string, string | null>;
  const today = new Date().toISOString().slice(0, 10);
  const dueStr = trigger_date ? ` [due: ${trigger_date}]` : "";
  const entry = `${today} ${text}${dueStr} (added by ${sender})\n`;

  const filePath = join(vaultPath, "reminders", "inbox.md");
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, entry, "utf8");

  console.log(`[reminder] appended to inbox: "${text}"${dueStr}`);
  return `Reminder added${dueStr}: ${text}`;
}
