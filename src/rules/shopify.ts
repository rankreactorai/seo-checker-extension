import { nodesOfType } from "../lib/jsonld";
import type { Finding, PageFacts, ShopifyPageType, ShopifySignals } from "../types";
import { COLLECTION_DESC_MIN_WORDS } from "./thresholds";

/** A page is treated as Shopify when at least 2 independent DOM signals are present. */
export function isShopify(signals: ShopifySignals): boolean {
  return Object.values(signals).filter(Boolean).length >= 2;
}

export function shopifyPageType(pathname: string): ShopifyPageType {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (/^\/collections\/[^/]+\/products\/[^/]+/i.test(p)) return "collection-product";
  if (/^\/products\/[^/]+/i.test(p)) return "product";
  if (/^\/collections\/[^/]+/i.test(p)) return "collection";
  if (/^\/blogs\//i.test(p)) return "blog";
  if (/^\/pages\//i.test(p)) return "page";
  if (p === "/") return "home";
  return "other";
}

const PRODUCT_ALT_FIX =
  "Add alt text in Shopify admin → Products → (product) → image → Add alt text.";
const SEO_LISTING_FIX =
  'Edit it in Shopify admin → Products → (product) → "Search engine listing". For the home page: Online Store → Preferences.';

function productSchemaFindings(f: PageFacts): Finding[] {
  const products = nodesOfType(f.jsonLd, "Product");
  if (products.length === 0) {
    return [
      {
        id: "shopify-product-schema",
        severity: "fail",
        text: "No Product schema (JSON-LD) found on this product page.",
        fix: "Most current Shopify themes output it. Check your theme, or use an SEO app that adds Product schema.",
      },
    ];
  }
  const out: Finding[] = [];
  const offer = products.find((p) => p.offers)?.offers;
  const missing = [
    !offer?.price && "offers.price",
    !offer?.priceCurrency && "priceCurrency",
    !offer?.availability && "availability",
  ].filter(Boolean) as string[];
  if (missing.length === 0) {
    out.push({
      id: "shopify-product-schema",
      severity: "pass",
      text: "Product schema includes price, currency and availability.",
    });
  } else {
    out.push({
      id: "shopify-product-schema",
      severity: "warn",
      text: `Product schema is missing ${missing.join(", ")}.`,
      fix: "Google needs these for price and stock in results. Update your theme or SEO app so the offer is complete.",
    });
  }
  if (!products.some((p) => p.hasAggregateRating)) {
    out.push({
      id: "shopify-rating",
      severity: "info",
      text: "No aggregateRating in the Product schema.",
      fix: "Add a reviews app that outputs schema, so ratings can show in search results.",
    });
  }
  return out;
}

function productImageFinding(f: PageFacts): Finding | null {
  const { productTotal, productMissing } = f.images;
  if (productTotal === 0) return null;
  if (productMissing > 0) {
    return {
      id: "shopify-product-alt",
      severity: "fail",
      text: `${productMissing} of ${productTotal} product images have no alt text.`,
      fix: PRODUCT_ALT_FIX,
    };
  }
  return {
    id: "shopify-product-alt",
    severity: "pass",
    text: `All ${productTotal} product images have alt text.`,
  };
}

function defaultTitleFinding(f: PageFacts): Finding | null {
  const store = f.og.siteName;
  const h1 = f.headings.find((h) => h.level === 1)?.text ?? "";
  if (!store || !h1 || !f.title) return null;
  const pattern = new RegExp(`^(.+?)\\s+[–—|-]\\s+${escapeRe(store)}$`, "i");
  const m = f.title.match(pattern);
  if (m && m[1].trim().toLowerCase() === h1.trim().toLowerCase()) {
    return {
      id: "shopify-default-title",
      severity: "info",
      text: `The title uses Shopify's default "Product – Store name" pattern: ${f.title}`,
      fix: `Add the term buyers search for. ${SEO_LISTING_FIX}`,
      copy: { label: "Copy title", value: f.title },
    };
  }
  return null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function canonicalFinding(f: PageFacts): Finding {
  const handle = f.pathname.match(/\/products\/([^/?#]+)/i)?.[1] ?? "";
  const expected = `/products/${handle}`;
  const canonicalPath =
    f.canonical && URL.canParse(f.canonical)
      ? new URL(f.canonical).pathname.replace(/\/$/, "")
      : "";
  if (canonicalPath.toLowerCase() === expected.toLowerCase()) {
    return {
      id: "shopify-duplicate-url",
      severity: "pass",
      text: `This collection URL's canonical points to ${expected}, so it isn't a duplicate.`,
    };
  }
  return {
    id: "shopify-duplicate-url",
    severity: "warn",
    text: `This /collections/…/products/ URL doesn't set its canonical to ${expected}. Google may see duplicate product pages.`,
    fix: "Shopify themes normally set this canonical. Check that your theme (or an app) hasn't changed the canonical tag.",
  };
}

function collectionFinding(f: PageFacts): Finding {
  const words = f.shopify.collectionDescriptionWords ?? 0;
  if (words < COLLECTION_DESC_MIN_WORDS) {
    return {
      id: "shopify-collection-description",
      severity: "warn",
      text:
        f.shopify.collectionDescriptionWords === null
          ? "No collection description found on this page."
          : `The collection description is ${words} words (aim for about ${COLLECTION_DESC_MIN_WORDS}+).`,
      fix: "Add a collection description in Shopify admin → Products → Collections → (collection) → Description.",
    };
  }
  return {
    id: "shopify-collection-description",
    severity: "pass",
    text: `The collection description is ${words} words.`,
  };
}

function blogLinkFinding(f: PageFacts): Finding {
  if (f.links.blogLink) {
    return { id: "shopify-blog", severity: "pass", text: "This page links to your store's blog." };
  }
  return {
    id: "shopify-blog",
    severity: "info",
    text: "No link to a /blogs/ page found here.",
    fix: "Shopify stores with a blog can rank for buyer questions. Add a blog in Online Store → Blog posts and link it from the menu.",
  };
}

export function evaluateShopify(f: PageFacts): {
  detected: boolean;
  pageType: ShopifyPageType;
  findings: Finding[];
} {
  const detected = isShopify(f.shopify.signals);
  const pageType = shopifyPageType(f.pathname);
  if (!detected) return { detected, pageType, findings: [] };
  const findings: Finding[] = [];
  const push = (x: Finding | null) => {
    if (x) findings.push(x);
  };
  if (pageType === "product" || pageType === "collection-product") {
    findings.push(...productSchemaFindings(f));
    push(productImageFinding(f));
    push(defaultTitleFinding(f));
  }
  if (pageType === "collection-product") findings.push(canonicalFinding(f));
  if (pageType === "collection") findings.push(collectionFinding(f));
  if (pageType === "home" || pageType === "blog") findings.push(blogLinkFinding(f));
  if (findings.length === 0) {
    findings.push({
      id: "shopify-generic",
      severity: "info",
      text: "Shopify store detected. Open a product or collection page for store-specific checks.",
    });
  }
  return { detected, pageType, findings };
}
