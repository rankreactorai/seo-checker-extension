import { describe, expect, it } from "vitest";
import { allTypes, nodesOfType, parseJsonLd } from "../../src/lib/jsonld";
import { evaluateSchema } from "../../src/rules/onpage";
import { byId, factsFor } from "../helpers";

describe("JSON-LD parsing", () => {
  it("collects types inside @graph and arrays of types", () => {
    const facts = parseJsonLd([
      JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": ["WebPage", "AboutPage"] },
          { "@type": "Organization", name: "Example" },
        ],
      }),
    ]);
    expect(allTypes(facts)).toEqual(["WebPage", "AboutPage", "Organization"]);
  });

  it("reads top-level arrays and nested FAQ entities", () => {
    const facts = parseJsonLd([
      JSON.stringify([
        { "@type": "Article", author: { name: "A" }, datePublished: "2026-01-01" },
        { "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "Q?" }] },
      ]),
    ]);
    expect(allTypes(facts)).toEqual(["Article", "FAQPage", "Question"]);
    expect(nodesOfType(facts, "article")[0]).toMatchObject({
      hasAuthor: true,
      datePublished: "2026-01-01",
    });
  });

  it("normalizes full schema.org type URLs", () => {
    expect(allTypes(parseJsonLd(['{"@type":"https://schema.org/Product"}']))).toEqual(["Product"]);
  });

  it("extracts offer price, currency and availability (object, array and AggregateOffer)", () => {
    const one = parseJsonLd([
      '{"@type":"Product","offers":{"price":"10.00","priceCurrency":"USD","availability":"InStock"}}',
    ]);
    expect(one.nodes[0].offers).toEqual({
      price: "10.00",
      priceCurrency: "USD",
      availability: "InStock",
    });
    const arr = parseJsonLd(['{"@type":"Product","offers":[{"price":5,"priceCurrency":"EUR"}]}']);
    expect(arr.nodes[0].offers).toMatchObject({ price: "5", priceCurrency: "EUR" });
    const agg = parseJsonLd([
      '{"@type":"Product","offers":{"@type":"AggregateOffer","lowPrice":"3"}}',
    ]);
    expect(agg.nodes[0].offers?.price).toBe("3");
  });

  it("counts invalid and empty blocks without throwing", () => {
    const facts = parseJsonLd(['{"@type": "Article",}', "", '{"@type":"Thing"}']);
    expect(facts.blocks).toBe(3);
    expect(facts.invalid).toBe(2);
    expect(allTypes(facts)).toEqual(["Thing"]);
  });

  it("warns on the broken JSON-LD fixture and still lists the valid @graph types", () => {
    const facts = factsFor("broken-jsonld.html", "https://example.test/about");
    expect(facts.jsonLd.invalid).toBe(2);
    const f = evaluateSchema(facts);
    expect(byId(f, "schema-invalid").severity).toBe("warn");
    expect(byId(f, "schema-invalid").text).toContain("Google ignores broken JSON-LD");
    expect(byId(f, "schema").text).toBe(
      "Schema types found: WebPage, AboutPage, Organization, BreadcrumbList, ListItem.",
    );
  });
});
