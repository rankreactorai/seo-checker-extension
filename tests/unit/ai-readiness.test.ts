import { describe, expect, it } from "vitest";
import { evaluateAi, isQuestionHeading } from "../../src/rules/ai-readiness";
import { byId, factsFor, text } from "../helpers";

describe("AI-answer readiness", () => {
  it("passes every check on the well-structured blog fixture", () => {
    const r = evaluateAi(
      factsFor("blog-post.html", "https://blog.example.test/a", {
        robots: text("User-agent: *\nAllow: /\n"),
        llms: text("# Brew Notes\n> Coffee guides\n"),
      }),
    );
    expect(r.findings.filter((f) => f.severity !== "pass").map((f) => f.id)).toEqual([]);
    expect(r).toMatchObject({ ready: 8, total: 8 });
    expect(byId(r.findings, "ai-faq").text).toBe("FAQPage schema found.");
  });

  it("flags the missing signals on a thin page", () => {
    const r = evaluateAi(factsFor("thin-page.html", "https://thin.example.test/"));
    for (const id of [
      "ai-direct-answer",
      "ai-question-headings",
      "ai-faq",
      "ai-identity",
      "ai-author",
      "ai-freshness",
      "ai-lists",
    ]) {
      expect(byId(r.findings, id).severity).toBe("warn");
    }
    expect(byId(r.findings, "ai-llms-txt").severity).toBe("info");
    expect(r.ready).toBe(1);
  });

  it("warns and names blocked AI crawlers", () => {
    const r = evaluateAi(
      factsFor("blog-post.html", "https://blog.example.test/a", {
        robots: text("User-agent: GPTBot\nDisallow: /\n\nUser-agent: PerplexityBot\nDisallow: /\n"),
      }),
    );
    const f = byId(r.findings, "ai-crawlers");
    expect(f.severity).toBe("warn");
    expect(f.text).toBe("robots.txt blocks GPTBot, PerplexityBot.");
  });

  it("treats llms.txt as optional", () => {
    const r = evaluateAi(factsFor("blog-post.html", "https://blog.example.test/a"));
    expect(byId(r.findings, "ai-llms-txt")).toMatchObject({ severity: "info" });
    expect(r.total).toBe(8);
  });

  it("recognizes FAQ markup without schema (details/summary)", () => {
    const facts = factsFor("blog-post.html", "https://blog.example.test/a");
    facts.jsonLd = { blocks: 0, invalid: 0, nodes: [] };
    expect(byId(evaluateAi(facts).findings, "ai-faq").text).toBe("FAQ-style content found.");
  });

  it("detects question-style headings", () => {
    expect(isQuestionHeading("How long does shipping take?")).toBe(true);
    expect(isQuestionHeading("Best mugs for travel")).toBe(true);
    expect(isQuestionHeading("Ceramic vs glass")).toBe(true);
    expect(isQuestionHeading("Shipping and returns")).toBe(false);
  });
});
