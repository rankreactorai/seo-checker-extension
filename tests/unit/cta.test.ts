import { describe, expect, it } from "vitest";
import { FOOTER_CTA, PRIVACY_LINK, buildCtaUrl, pickContextCta } from "../../src/lib/cta";
import type { Finding } from "../../src/types";

const UTM = "utm_source=chrome-extension&utm_medium=extension&utm_campaign=seo-checker";

describe("CTA builder", () => {
  it("builds UTM-tagged links to allowed pages", () => {
    expect(buildCtaUrl("/", "footer")).toBe(`https://rankreactor.ai/?${UTM}&utm_content=footer`);
    expect(buildCtaUrl("/pricing", "thin-content")).toBe(
      `https://rankreactor.ai/pricing?${UTM}&utm_content=thin-content`,
    );
    expect(buildCtaUrl("/privacy-policy", "privacy")).toBe(
      `https://rankreactor.ai/privacy-policy?${UTM}&utm_content=privacy`,
    );
  });

  it("puts the query string before the hash on /tools", () => {
    expect(buildCtaUrl("/tools", "title-tag", "title-tag")).toBe(
      `https://rankreactor.ai/tools?${UTM}&utm_content=title-tag#title-tag`,
    );
  });

  it("rejects other paths and hashes", () => {
    // @ts-expect-error not an allowed path
    expect(() => buildCtaUrl("/dash", "footer")).toThrow();
    expect(() => buildCtaUrl("/", "footer", "x")).toThrow();
    expect(() => buildCtaUrl("/tools", "title-tag", "a b")).toThrow();
  });

  it("never carries a domain or URL parameter", () => {
    for (const url of [
      FOOTER_CTA.url,
      PRIVACY_LINK.url,
      buildCtaUrl("/tools", "title-tag", "title-tag"),
    ]) {
      const u = new URL(url);
      expect([...u.searchParams.keys()].sort()).toEqual([
        "utm_campaign",
        "utm_content",
        "utm_medium",
        "utm_source",
      ]);
      expect(u.hostname).toBe("rankreactor.ai");
    }
  });
});

describe("context CTA picker", () => {
  const f = (id: string, severity: Finding["severity"]): Finding => ({ id, severity, text: id });

  it("picks the Title Tag Optimizer when title or description fails", () => {
    expect(pickContextCta("overview", [f("title", "fail"), f("words", "warn")])?.slot).toBe(
      "title-tag",
    );
  });

  it("picks thin content when word count is the top failing finding", () => {
    expect(pickContextCta("overview", [f("title", "warn"), f("words", "fail")])?.slot).toBe(
      "thin-content",
    );
  });

  it("shows nothing on a clean overview", () => {
    expect(pickContextCta("overview", [f("title", "pass"), f("alt", "fail")])).toBeNull();
  });

  it("uses fixed CTAs on the Shopify and AI tabs", () => {
    expect(pickContextCta("shopify", [f("shopify-product-alt", "fail")])?.slot).toBe("shopify");
    expect(pickContextCta("shopify", [f("shopify-blog", "info")])?.slot).toBe("thin-content");
    expect(pickContextCta("ai", [])?.slot).toBe("ai-answers");
  });
});
