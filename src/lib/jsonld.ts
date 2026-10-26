import type { JsonLdFacts, JsonLdNode } from "../types";

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toTypes(v: unknown): string[] {
  if (typeof v === "string") return [v.replace(/^https?:\/\/schema\.org\//i, "")];
  if (Array.isArray(v)) return v.flatMap(toTypes);
  return [];
}

function str(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return undefined;
}

function firstOffer(v: unknown): Obj | undefined {
  if (Array.isArray(v)) return v.find(isObj);
  if (isObj(v)) {
    // AggregateOffer exposes lowPrice instead of price.
    return v;
  }
  return undefined;
}

function summarize(node: Obj): JsonLdNode {
  const out: JsonLdNode = {
    types: toTypes(node["@type"]),
    hasAuthor: node.author !== undefined && node.author !== null && node.author !== "",
    hasAggregateRating: isObj(node.aggregateRating),
  };
  const published = str(node.datePublished);
  const modified = str(node.dateModified);
  if (published) out.datePublished = published;
  if (modified) out.dateModified = modified;
  const offer = firstOffer(node.offers);
  if (offer) {
    out.offers = {
      price: str(offer.price) ?? str(offer.lowPrice),
      priceCurrency: str(offer.priceCurrency),
      availability: str(offer.availability),
    };
  }
  return out;
}

/** Walk a parsed JSON-LD value, collecting every typed node (including inside @graph). */
function collect(value: unknown, out: JsonLdNode[], depth = 0): void {
  if (depth > 8 || out.length > 200) return;
  if (Array.isArray(value)) {
    for (const v of value) collect(v, out, depth + 1);
    return;
  }
  if (!isObj(value)) return;
  if (value["@type"] !== undefined) out.push(summarize(value));
  if (Array.isArray(value["@graph"])) collect(value["@graph"], out, depth + 1);
  // Nested entities that commonly carry their own type (FAQ mainEntity, Product inside WebPage).
  for (const key of ["mainEntity", "itemListElement", "hasPart"]) {
    if (value[key] !== undefined) collect(value[key], out, depth + 1);
  }
}

/** Parse the text of every ld+json script. Invalid JSON is counted, never thrown. */
export function parseJsonLd(sources: string[]): JsonLdFacts {
  const facts: JsonLdFacts = { blocks: sources.length, invalid: 0, nodes: [] };
  for (const src of sources) {
    const text = src.trim();
    if (!text) {
      facts.invalid += 1;
      continue;
    }
    try {
      collect(JSON.parse(text), facts.nodes);
    } catch {
      facts.invalid += 1;
    }
  }
  return facts;
}

export function allTypes(facts: JsonLdFacts): string[] {
  return [...new Set(facts.nodes.flatMap((n) => n.types))];
}

export function nodesOfType(facts: JsonLdFacts, type: string): JsonLdNode[] {
  const t = type.toLowerCase();
  return facts.nodes.filter((n) => n.types.some((x) => x.toLowerCase() === t));
}
