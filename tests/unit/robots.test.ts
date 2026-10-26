import { describe, expect, it } from "vitest";
import { aiBotAccess, parseRobotsGroups, sitemapLines } from "../../src/lib/robots";

const blocked = (txt: string) =>
  aiBotAccess(txt)
    .filter((a) => a.blocked)
    .map((a) => a.bot);

describe("robots.txt AI-bot parser", () => {
  it("finds no blocks in a permissive file", () => {
    expect(blocked("User-agent: *\nDisallow:\n")).toEqual([]);
    expect(blocked("")).toEqual([]);
  });

  it("names the bots that are disallowed from the whole site", () => {
    const txt = [
      "User-agent: GPTBot",
      "Disallow: /",
      "",
      "User-agent: PerplexityBot",
      "User-agent: ClaudeBot",
      "Disallow: /",
      "",
      "User-agent: *",
      "Disallow: /cart",
    ].join("\n");
    expect(blocked(txt)).toEqual(["GPTBot", "ClaudeBot", "PerplexityBot"]);
  });

  it("is case-insensitive and ignores comments", () => {
    expect(blocked("user-agent: oai-searchbot # search\ndisallow: / # all\n")).toEqual([
      "OAI-SearchBot",
    ]);
  });

  it("applies a wildcard block to bots without their own group", () => {
    const access = aiBotAccess("User-agent: *\nDisallow: /\n\nUser-agent: GPTBot\nAllow: /\n");
    const gpt = access.find((a) => a.bot === "GPTBot");
    const claude = access.find((a) => a.bot === "ClaudeBot");
    expect(gpt).toMatchObject({ blocked: false, via: "bot" });
    expect(claude).toMatchObject({ blocked: true, via: "wildcard" });
  });

  it("does not treat a partial disallow as a block", () => {
    expect(blocked("User-agent: Google-Extended\nDisallow: /private/\n")).toEqual([]);
  });

  it("lets Allow: / override Disallow: / in the same group", () => {
    expect(blocked("User-agent: ChatGPT-User\nDisallow: /\nAllow: /\n")).toEqual([]);
  });

  it("groups consecutive user-agent lines", () => {
    const groups = parseRobotsGroups(
      "User-agent: a\nUser-agent: b\nDisallow: /x\nUser-agent: c\nAllow: /\n",
    );
    expect(groups.map((g) => g.agents)).toEqual([["a", "b"], ["c"]]);
  });

  it("extracts Sitemap: lines", () => {
    expect(
      sitemapLines("Sitemap: https://a.test/s1.xml\nUser-agent: *\nsitemap:https://a.test/s2.xml"),
    ).toEqual(["https://a.test/s1.xml", "https://a.test/s2.xml"]);
  });
});
