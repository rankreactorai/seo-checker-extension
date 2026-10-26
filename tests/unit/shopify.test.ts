import { describe, expect, it } from "vitest";
import { evaluateShopify, isShopify, shopifyPageType } from "../../src/rules/shopify";
import { byId, factsFor } from "../helpers";

describe("Shopify detection", () => {
  it("detects the product fixture (all four signals)", () => {
    const facts = factsFor("shopify-product.html", "https://shop.example.test/products/x");
    expect(facts.shopify.signals).toEqual({
      cdnAsset: true,
      shopifyMeta: true,
      featuresEl: true,
      themeScript: true,
    });
    expect(isShopify(facts.shopify.signals)).toBe(true);
  });

  it("does not flag a non-Shopify blog with a single CDN reference", () => {
    const facts = factsFor("blog-post.html", "https://blog.example.test/a");
    expect(facts.shopify.signals.cdnAsset).toBe(true);
    expect(isShopify(facts.shopify.signals)).toBe(false);
    expect(evaluateShopify(facts)).toEqual({ detected: false, pageType: "other", findings: [] });
  });

  it("needs at least two signals", () => {
    const none = { cdnAsset: false, shopifyMeta: false, featuresEl: false, themeScript: false };
    expect(isShopify({ ...none, themeScript: true })).toBe(false);
    expect(isShopify({ ...none, themeScript: true, shopifyMeta: true })).toBe(true);
  });

  it("classifies page types from the path", () => {
    expect(shopifyPageType("/products/mug")).toBe("product");
    expect(shopifyPageType("/collections/mugs")).toBe("collection");
    expect(shopifyPageType("/collections/mugs/products/mug")).toBe("collection-product");
    expect(shopifyPageType("/blogs/news/post")).toBe("blog");
    expect(shopifyPageType("/pages/about")).toBe("page");
    expect(shopifyPageType("/")).toBe("home");
    expect(shopifyPageType("/cart")).toBe("other");
  });
});

describe("Shopify tips", () => {
  const product = () =>
    evaluateShopify(
      factsFor(
        "shopify-product.html",
        "https://shop.example.test/products/stoneware-pour-over-set",
      ),
    );

  it("passes complete Product schema and suggests reviews schema", () => {
    const r = product();
    expect(r.pageType).toBe("product");
    expect(byId(r.findings, "shopify-product-schema").severity).toBe("pass");
    expect(byId(r.findings, "shopify-rating").text).toContain("aggregateRating");
    expect(byId(r.findings, "shopify-rating").fix).toContain("reviews app");
  });

  it("fails product images without alt text and names the admin path", () => {
    const f = byId(product().findings, "shopify-product-alt");
    expect(f.severity).toBe("fail");
    expect(f.text).toBe("1 of 3 product images have no alt text.");
    expect(f.fix).toContain("Shopify admin → Products");
  });

  it("notes the default 'Product – Store name' title pattern", () => {
    const f = byId(product().findings, "shopify-default-title");
    expect(f.severity).toBe("info");
    expect(f.fix).toContain("Search engine listing");
  });

  it("warns when a /collections/*/products/* URL isn't canonicalized to /products/*", () => {
    const r = evaluateShopify(
      factsFor(
        "shopify-collection-product.html",
        "https://shop.example.test/collections/mugs/products/speckled-mug",
      ),
    );
    expect(r.pageType).toBe("collection-product");
    const dup = byId(r.findings, "shopify-duplicate-url");
    expect(dup.severity).toBe("warn");
    expect(dup.text).toContain("/products/speckled-mug");
    // Incomplete offer (no availability) and rating present.
    expect(byId(r.findings, "shopify-product-schema").text).toContain("availability");
    expect(r.findings.some((f) => f.id === "shopify-rating")).toBe(false);
  });

  it("passes when the collection-product canonical points to /products/*", () => {
    const facts = factsFor(
      "shopify-collection-product.html",
      "https://shop.example.test/collections/mugs/products/speckled-mug",
    );
    facts.canonical = "https://shop.example.test/products/speckled-mug";
    expect(byId(evaluateShopify(facts).findings, "shopify-duplicate-url").severity).toBe("pass");
  });

  it("warns on a thin collection description", () => {
    const r = evaluateShopify(
      factsFor("shopify-collection.html", "https://shop.example.test/collections/mugs"),
    );
    expect(r.detected).toBe(true);
    const f = byId(r.findings, "shopify-collection-description");
    expect(f.severity).toBe("warn");
    expect(f.text).toContain("6 words");
    expect(f.fix).toContain("Collections");
  });

  it("suggests a blog on the home page when there's no /blogs/ link", () => {
    const facts = factsFor("shopify-product.html", "https://shop.example.test/");
    const f = byId(evaluateShopify(facts).findings, "shopify-blog");
    expect(f.severity).toBe("info");
    expect(f.fix).toContain("can rank for buyer questions");
    facts.links.blogLink = true;
    expect(byId(evaluateShopify(facts).findings, "shopify-blog").severity).toBe("pass");
  });
});
