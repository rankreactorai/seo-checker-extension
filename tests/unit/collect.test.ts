import { describe, expect, it, vi } from "vitest";
import { collectFacts, fetchSameOrigin } from "../../src/inject/collect";
import { fixtureDoc } from "../helpers";

function mockFetcher() {
  return vi.fn(async (input: string, init?: RequestInit) => {
    const path = new URL(input).pathname;
    if (init?.method === "HEAD") {
      return new Response(null, { status: 200, headers: { "x-robots-tag": "noindex" } });
    }
    if (path === "/robots.txt") return new Response("User-agent: *\nDisallow:\n", { status: 200 });
    return new Response("nope", { status: 404 });
  });
}

describe("collectFacts", () => {
  it("only requests the checked site's own origin, without credentials", async () => {
    const fetcher = mockFetcher();
    const facts = await collectFacts(
      fixtureDoc("blog-post.html"),
      "https://blog.example.test/guides/choose#top",
      fetcher,
    );
    const calls = fetcher.mock.calls.map(([url, init]) => ({ url, init }));
    expect(calls.map((c) => c.url).sort()).toEqual([
      "https://blog.example.test/guides/choose",
      "https://blog.example.test/llms.txt",
      "https://blog.example.test/robots.txt",
      "https://blog.example.test/sitemap.xml",
    ]);
    for (const c of calls) expect(c.init?.credentials).toBe("omit");
    expect(calls.find((c) => c.init?.method === "HEAD")?.url).toBe(
      "https://blog.example.test/guides/choose",
    );
    expect(facts.network.head.xRobotsTag).toBe("noindex");
    expect(facts.network.robots.ok).toBe(true);
    expect(facts.network.sitemap.ok).toBe(false);
  });

  it("reports network errors instead of throwing", async () => {
    const failing = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const facts = await collectFacts(
      fixtureDoc("thin-page.html"),
      "https://thin.example.test/",
      failing,
    );
    expect(facts.network.head).toMatchObject({ status: null, ok: false });
    expect(facts.network.robots).toMatchObject({ ok: false, status: null });
  });

  it("refuses to fetch another origin", async () => {
    const fetcher = mockFetcher();
    const r = await fetchSameOrigin(fetcher, "https://a.test", "https://b.test/robots.txt");
    expect(r.error).toBe("cross-origin");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
