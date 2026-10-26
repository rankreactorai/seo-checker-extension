/** Crawlers used by AI search and answer tools that we check robots.txt for. */
export const AI_BOTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "PerplexityBot",
  "Google-Extended",
] as const;

export type AiBot = (typeof AI_BOTS)[number];

type Group = { agents: string[]; allow: string[]; disallow: string[] };

export function parseRobotsGroups(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "allow") current.allow.push(value);
    if (key === "disallow") current.disallow.push(value);
  }
  return groups;
}

export function sitemapLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^sitemap\s*:/i.test(l))
    .map((l) => l.replace(/^sitemap\s*:\s*/i, ""));
}

export type BotAccess = { bot: AiBot; blocked: boolean; via: "bot" | "wildcard" | "none" };

function blocksRoot(group: Group): boolean {
  const disallowAll = group.disallow.some((d) => d === "/" || d === "/*");
  const allowAll = group.allow.some((a) => a === "/" || a === "/*");
  return disallowAll && !allowAll;
}

/**
 * For each AI bot, find the group that applies (a group naming the bot, else "*")
 * and report whether the whole site is disallowed for it.
 */
export function aiBotAccess(text: string): BotAccess[] {
  const groups = parseRobotsGroups(text);
  return AI_BOTS.map((bot) => {
    const name = bot.toLowerCase();
    const specific = groups.filter((g) => g.agents.includes(name));
    if (specific.length > 0) {
      return { bot, blocked: specific.some(blocksRoot), via: "bot" as const };
    }
    const wildcard = groups.filter((g) => g.agents.includes("*"));
    if (wildcard.length > 0) {
      return { bot, blocked: wildcard.some(blocksRoot), via: "wildcard" as const };
    }
    return { bot, blocked: false, via: "none" as const };
  });
}
