// Calendar handler — stub until M5 (Google Calendar via MCP).

import { type RouterResult } from "../router.js";

export function handleCalendar(result: RouterResult): string {
  console.log(`[calendar] intent=${result.intent} fields=${JSON.stringify(result.fields)}`);
  // TODO M5: wire Google Calendar MCP
  return "Calendar integration coming in M5 — can't do that just yet.";
}
