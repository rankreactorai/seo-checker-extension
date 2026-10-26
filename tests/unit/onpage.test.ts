import { describe, expect, it } from "vitest";
import { evaluate } from "../../src/rules/evaluate";
import { evaluateOnPage, sitemapExists, textFileExists } from "../../src/rules/onpage";
import { byId, factsFor, text } from "../helpers";

const PRODUCT_URL = "https://shop.example.test/products/stoneware-pour-over-set";

describe("on-page rules", () => {
  it("passes a well-formed Shopify product page", () => {
    const facts = factsFor("shopify-product.html", PRODUCT_URL);
    const f = evaluateOnPage(facts);
    expect(byId(f, "title").severity).toBe("pass");
    expect(byId(f, "title").copy?.value).toBe(
      "Stoneware Pour-Over Coffee Set – Harbor & Pine Ceramics",
    );
    expect(byId(f, "description").severity).toBe("pass");
    expect(byId(f, "h1").severity).toBe("pass");
    expect(byId(f, "h2").severity).toBe("pass");
    expect(byId(f, "canonical").severity).toBe("pass");
    expect(byId(f, "indexability").severity).toBe("pass");
    expect(byId(f, "status").severity).toBe("pass");
    expect(byId(f, "social").severity).toBe("pass");
    expect(byId(f, "lang").severity).toBe("pass");
    expect(byId(f, "words").severity).toBe("pass");
    expect(facts.wordCount).toBeGreaterThanOrEqual(300);
  });

  it("counts missing, empty and present alt text like the site tools", () => {
    const facts = factsFor("shopify-product.html", PRODUCT_URL);
    expect(facts.images).toMatchObject({ total: 3, withAlt: 2, missing: 1, decorative: 0 });
    const alt = byId(evaluateOnPage(facts), "alt");
    expect(alt.severity).toBe("warn");
    expect(alt.text).toBe("2 of 3 images have an alt attribute (1 missing).");
  });

  it("flags decorative images and decorative-only links", () => {
    const f = evaluateOnPage(factsFor("thin-page.html", "https://thin.example.test/"));
    expect(byId(f, "alt").text).toBe("All 1 images have an alt attribute.");
    expect(byId(f, "alt-decorative").text).toBe("1 image uses empty alt text (decorative).");
    expect(byId(f, "alt-link").severity).toBe("info");
  });

  it("fails a thin page with no title, description, lang or H1 discipline", () => {
    const f = evaluateOnPage(factsFor("thin-page.html", "https://thin.example.test/"));
    expect(byId(f, "title")).toMatchObject({ severity: "fail", text: "Title tag is missing." });
    expect(byId(f, "description")).toMatchObject({
      severity: "fail",
      text: "Meta description is missing.",
    });
    expect(byId(f, "h1").severity).toBe("warn");
    expect(byId(f, "h2").severity).toBe("warn");
    expect(byId(f, "canonical").severity).toBe("warn");
    expect(byId(f, "words").severity).toBe("fail");
    expect(byId(f, "lang").severity).toBe("warn");
    expect(byId(f, "social").severity).toBe("warn");
    expect(byId(f, "schema").severity).toBe("warn");
  });

  it("applies the title and description length thresholds", () => {
    const base = factsFor("thin-page.html", "https://thin.example.test/");
    const t = (n: number) => byId(evaluateOnPage({ ...base, title: "x".repeat(n) }), "title");
    expect(t(29).severity).toBe("warn");
    expect(t(30).severity).toBe("pass");
    expect(t(60).severity).toBe("pass");
    expect(t(61).severity).toBe("warn");
    expect(t(70).severity).toBe("warn");
    expect(t(71).severity).toBe("fail");
    const d = (n: number) =>
      byId(evaluateOnPage({ ...base, metaDescription: "y".repeat(n) }), "description");
    expect(d(119).severity).toBe("warn");
    expect(d(120).severity).toBe("pass");
    expect(d(160).severity).toBe("pass");
    expect(d(180).severity).toBe("warn");
    expect(d(181).severity).toBe("fail");
  });

  it("applies the word count thresholds", () => {
    const base = factsFor("thin-page.html", "https://thin.example.test/");
    const w = (n: number) => byId(evaluateOnPage({ ...base, wordCount: n }), "words").severity;
    expect(w(49)).toBe("fail");
    expect(w(50)).toBe("warn");
    expect(w(299)).toBe("warn");
    expect(w(300)).toBe("pass");
  });

  it("fails meta robots noindex", () => {
    const f = evaluateOnPage(factsFor("noindex.html", "https://shop.example.test/thank-you"));
    const idx = byId(f, "indexability");
    expect(idx.severity).toBe("fail");
    expect(idx.text).toContain("can't appear in Google");
    expect(idx.text).toContain("meta robots");
  });

  it("fails an X-Robots-Tag noindex header", () => {
    const facts = factsFor("blog-post.html", "https://blog.example.test/guides/x", {
      head: { xRobotsTag: "noindex, nofollow" },
    });
    const idx = byId(evaluateOnPage(facts), "indexability");
    expect(idx.severity).toBe("fail");
    expect(idx.text).toContain("X-Robots-Tag");
  });

  it("warns on a non-2xx HTTP status and stays calm when HEAD fails", () => {
    const base = "https://blog.example.test/guides/x";
    expect(
      byId(
        evaluateOnPage(factsFor("blog-post.html", base, { head: { status: 404, ok: false } })),
        "status",
      ).severity,
    ).toBe("warn");
    expect(
      byId(
        evaluateOnPage(factsFor("blog-post.html", base, { head: { status: null, ok: false } })),
        "status",
      ).severity,
    ).toBe("info");
  });

  it("shows info when the canonical points elsewhere", () => {
    const f = evaluateOnPage(
      factsFor("blog-post.html", "https://blog.example.test/guides/choose?ref=x"),
    );
    const c = byId(f, "canonical");
    expect(c.severity).toBe("info");
    expect(c.text).toContain("https://blog.example.test/guides/choose-a-pour-over-dripper");
  });

  it("counts internal, external and nofollow links", () => {
    const facts = factsFor("blog-post.html", "https://blog.example.test/guides/choose");
    expect(facts.links).toMatchObject({ internal: 4, external: 1, nofollow: 1 });
    const thin = factsFor("thin-page.html", "https://thin.example.test/");
    expect(
      byId(evaluateOnPage({ ...thin, links: { ...thin.links, internal: 0 } }), "links").severity,
    ).toBe("warn");
  });

  it("lists the H1–H3 outline", () => {
    const facts = factsFor("shopify-product.html", PRODUCT_URL);
    expect(facts.headings.map((h) => h.level)).toEqual([1, 2, 2, 3, 2, 2]);
    expect(facts.headings[0].text).toBe("Stoneware Pour-Over Coffee Set");
  });

  it("detects robots.txt, its Sitemap: lines and sitemap.xml", () => {
    const facts = factsFor("blog-post.html", "https://blog.example.test/a", {
      robots: text(
        "User-agent: *\nDisallow: /cart\nSitemap: https://blog.example.test/sitemap.xml\n",
      ),
      sitemap: text(
        '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
        "application/xml",
      ),
    });
    const f = evaluateOnPage(facts);
    expect(byId(f, "robots-txt").severity).toBe("pass");
    expect(byId(f, "robots-txt").text).toContain("https://blog.example.test/sitemap.xml");
    expect(byId(f, "sitemap").severity).toBe("pass");
  });

  it("treats an HTML catch-all page as a missing robots.txt / sitemap", () => {
    const html = text("<!doctype html><html><body>Not found</body></html>", "text/html");
    expect(textFileExists(html)).toBe(false);
    expect(sitemapExists(html)).toBe(false);
    const f = evaluateOnPage(
      factsFor("blog-post.html", "https://b.example.test/", { robots: html, sitemap: html }),
    );
    expect(byId(f, "robots-txt").severity).toBe("warn");
    expect(byId(f, "sitemap").severity).toBe("warn");
  });

  it("evaluate() returns all three tabs", () => {
    const r = evaluate(factsFor("blog-post.html", "https://blog.example.test/a"));
    expect(r.overview.length).toBeGreaterThan(10);
    expect(r.shopify.detected).toBe(false);
    expect(r.ai.total).toBe(8);
  });
});
