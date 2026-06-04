import fs from "node:fs/promises";
import path from "node:path";

const SHOPPING_FILE = "household/shopping.md";
const HEADER = "# Shopping List\n\n";

function shoppingPath(vaultPath: string): string {
  return path.join(vaultPath, SHOPPING_FILE);
}

async function ensureFile(p: string): Promise<void> {
  try {
    await fs.access(p);
  } catch {
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, HEADER);
  }
}

export async function handleShoppingAdd(items: string[], vaultPath: string): Promise<string> {
  const p = shoppingPath(vaultPath);
  await ensureFile(p);
  const lines = items.map((item) => `- ${item}`).join("\n") + "\n";
  await fs.appendFile(p, lines);
  const word = items.length === 1 ? "item" : "items";
  return `Added ${items.length} ${word} to the shopping list.`;
}

export async function handleShoppingRead(vaultPath: string): Promise<string> {
  const p = shoppingPath(vaultPath);
  try {
    const content = await fs.readFile(p, "utf8");
    const items = content
      .split("\n")
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2).trim());
    if (items.length === 0) return "Shopping list is empty.";
    return `Shopping list:\n${items.map((i) => `• ${i}`).join("\n")}`;
  } catch {
    return "Shopping list is empty.";
  }
}

export async function handleShoppingClear(vaultPath: string): Promise<string> {
  const p = shoppingPath(vaultPath);
  try {
    await fs.writeFile(p, HEADER);
    return "Shopping list cleared.";
  } catch {
    return "Nothing on the shopping list.";
  }
}
