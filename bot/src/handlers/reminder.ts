// Reminder handler — appends to vault reminders inbox.
// Vault path comes from config; wired up in M4.

import { type RouterResult } from "../router.js";

export function handleReminder(result: RouterResult): string {
  const { text, trigger_date } = result.fields as Record<string, string | null>;
  const dateStr = trigger_date ? ` (due ${trigger_date})` : "";
  console.log(`[reminder] text="${text}"${dateStr}`);
  // TODO M4: append to /vault/reminders/inbox.md
  return `Reminder noted${dateStr} — vault writes coming in M4.`;
}
