// Standalone Telegram sender for use outside the grammy bot context (cron jobs, scripts).
// Uses the Bot API directly via fetch — no grammy dependency.

const TELEGRAM_API = "https://api.telegram.org";

export async function sendMessage(
  botToken: string,
  chatId: string | number,
  text: string,
): Promise<void> {
  const url = `${TELEGRAM_API}/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram sendMessage failed ${res.status}: ${body}`);
  }
}

export async function sendDocument(
  botToken: string,
  chatId: string | number,
  filename: string,
  content: string,
  caption?: string,
): Promise<void> {
  const url = `${TELEGRAM_API}/bot${botToken}/sendDocument`;
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("document", new Blob([content], { type: "text/plain" }), filename);
  if (caption) form.append("caption", caption);

  const res = await fetch(url, { method: "POST", body: form });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram sendDocument failed ${res.status}: ${body}`);
  }
}
