import { parseJsonLd } from "../lib/jsonld";
import type { FetchResult, HeadResult, Heading, PageFacts } from "../types";

const EXCLUDED = "nav, header, footer, script, style, noscript, template, svg, iframe";
const TEXT_LIMIT = 200_000;
const TIMEOUT_MS = 6000;

function clean(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function words(text: string): number {
  const t = clean(text);
  return t ? t.split(" ").filter((w) => /[\p{L}\p{N}]/u.test(w)).length : 0;
}

function meta(doc: Document, selector: string): string {
  return clean(doc.querySelector<HTMLMetaElement>(selector)?.getAttribute("content"));
}

function visibleText(root: Element): string {
  const clone = root.cloneNode(true) as Element;
  clone.querySelectorAll(EXCLUDED).forEach((el) => el.remove());
  // Join text nodes with spaces so words in adjacent elements don't merge.
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(clone, 4 /* NodeFilter.SHOW_TEXT */);
  const parts: string[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) parts.push(n.nodeValue ?? "");
  return parts.join(" ");
}

/** Bylines, dates and prices are not the "answer" paragraph. */
function isMetaParagraph(p: Element): boolean {
  if (/\b(byline|author|meta|date|price|breadcrumb)/i.test(p.getAttribute("class") ?? ""))
    return true;
  return p.querySelector("time") !== null && words(p.textContent ?? "") < 12;
}

function isProductImage(img: HTMLImageElement): boolean {
  const src = `${img.getAttribute("src") ?? ""} ${img.getAttribute("srcset") ?? ""}`;
  if (/\/products\//i.test(src)) return true;
  return Boolean(
    img.closest(
      '[class*="product__media"], [class*="product-media"], [class*="product-gallery"], [class*="product__image"], [class*="product-single__photo"], [data-product-media], [data-media-id]',
    ),
  );
}

export function collectDomFacts(doc: Document, href: string): Omit<PageFacts, "network"> {
  const url = new URL(href);
  const main = doc.querySelector("main") ?? doc.querySelector('[role="main"]') ?? doc.body;

  const headings: Heading[] = [];
  doc.querySelectorAll("h1, h2, h3").forEach((el) => {
    const level = Number(el.tagName.slice(1)) as 1 | 2 | 3;
    headings.push({ level, text: clean(el.textContent).slice(0, 200) });
  });

  const imgs = Array.from(doc.querySelectorAll<HTMLImageElement>("img"));
  const images = {
    total: imgs.length,
    withAlt: 0,
    missing: 0,
    decorative: 0,
    decorativeLinkOnly: 0,
    productTotal: 0,
    productMissing: 0,
  };
  for (const img of imgs) {
    const alt = img.getAttribute("alt");
    const product = isProductImage(img);
    if (product) images.productTotal += 1;
    if (alt === null) {
      images.missing += 1;
      if (product) images.productMissing += 1;
    } else if (alt.trim() === "") {
      images.decorative += 1;
      if (product) images.productMissing += 1;
      const link = img.closest("a");
      if (link && clean(link.textContent) === "" && link.querySelectorAll("img").length === 1) {
        images.decorativeLinkOnly += 1;
      }
    } else {
      images.withAlt += 1;
    }
  }

  const ldSources = Array.from(doc.querySelectorAll('script[type="application/ld+json" i]')).map(
    (s) => s.textContent ?? "",
  );

  const links = { internal: 0, external: 0, nofollow: 0, blogLink: false };
  doc.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
    const raw = a.getAttribute("href") ?? "";
    if (!raw || raw.startsWith("#") || /^(javascript|mailto|tel|sms|data):/i.test(raw)) return;
    let target: URL;
    try {
      target = new URL(raw, url);
    } catch {
      return;
    }
    if (!/^https?:$/.test(target.protocol)) return;
    const sameSite = target.hostname.replace(/^www\./, "") === url.hostname.replace(/^www\./, "");
    if (sameSite) {
      links.internal += 1;
      if (/^\/blogs?\//i.test(target.pathname)) links.blogLink = true;
    } else {
      links.external += 1;
    }
    if (/\bnofollow\b/i.test(a.getAttribute("rel") ?? "")) links.nofollow += 1;
  });

  // First paragraph after the H1 (or the first paragraph in main).
  const h1 = doc.querySelector("h1");
  let firstP: Element | null = null;
  let afterH1 = false;
  if (h1) {
    const all = Array.from(doc.querySelectorAll("p"));
    firstP =
      all.find(
        (p) =>
          Boolean(h1.compareDocumentPosition(p) & 4 /* FOLLOWING */) &&
          !p.closest("nav, header, footer") &&
          !isMetaParagraph(p) &&
          words(p.textContent ?? "") > 0,
      ) ?? null;
    afterH1 = firstP !== null;
  }
  if (!firstP) {
    firstP =
      Array.from(main.querySelectorAll("p")).find(
        (p) => !isMetaParagraph(p) && words(p.textContent ?? "") > 0,
      ) ?? null;
  }

  const inlineScripts = Array.from(doc.querySelectorAll("script:not([src])"))
    .map((s) => s.textContent ?? "")
    .join("\n");

  const collectionDescEl = doc.querySelector(
    '.collection-description, .collection__description, [class*="collection-hero__description"], [class*="collection__description"], .collection-header__description',
  );

  const canonicalEl = doc.querySelector<HTMLLinkElement>('link[rel~="canonical" i]');
  const canonicalRaw = canonicalEl?.getAttribute("href");
  let canonical: string | null = null;
  if (canonicalRaw) {
    try {
      canonical = new URL(canonicalRaw, url).href;
    } catch {
      canonical = canonicalRaw;
    }
  }

  return {
    url: url.href,
    origin: url.origin,
    pathname: url.pathname,
    title: clean(doc.title || doc.querySelector("title")?.textContent),
    metaDescription: doc.querySelector('meta[name="description" i]')
      ? meta(doc, 'meta[name="description" i]')
      : null,
    lang: clean(doc.documentElement.getAttribute("lang")),
    canonical,
    metaRobots: meta(doc, 'meta[name="robots" i]'),
    googlebot: meta(doc, 'meta[name="googlebot" i]'),
    headings,
    images,
    jsonLd: parseJsonLd(ldSources),
    wordCount: words(visibleText(main)),
    links,
    og: {
      title: meta(doc, 'meta[property="og:title"]'),
      description: meta(doc, 'meta[property="og:description"]'),
      image: meta(doc, 'meta[property="og:image"]'),
      siteName: meta(doc, 'meta[property="og:site_name"]'),
    },
    twitter: {
      card: meta(doc, 'meta[name="twitter:card"]'),
      title: meta(doc, 'meta[name="twitter:title"]'),
      description: meta(doc, 'meta[name="twitter:description"]'),
      image: meta(doc, 'meta[name="twitter:image"]'),
    },
    ai: {
      firstParagraphWords: firstP ? words(firstP.textContent ?? "") : 0,
      firstParagraphAfterH1: afterH1,
      detailsCount: doc.querySelectorAll("details > summary").length,
      faqHeading: Array.from(doc.querySelectorAll("h1, h2, h3, h4")).some((h) =>
        /\b(faqs?|frequently asked questions)\b/i.test(h.textContent ?? ""),
      ),
      metaAuthor: meta(doc, 'meta[name="author" i]'),
      relAuthor: doc.querySelector('[rel~="author"]') !== null,
      bylineElement:
        doc.querySelector('.author, .byline, [itemprop="author"], [class*="article-author"]') !==
        null,
      timeDatetime: doc.querySelector("time[datetime]") !== null,
      listsOrTables: main.querySelectorAll("ul, ol, table").length,
    },
    shopify: {
      signals: {
        cdnAsset:
          doc.querySelector('script[src*="cdn.shopify.com"], link[href*="cdn.shopify.com"]') !==
          null,
        shopifyMeta:
          doc.querySelector(
            'meta[name="shopify-digital-wallet"], meta[name="shopify-checkout-api-token"]',
          ) !== null,
        featuresEl: doc.getElementById("shopify-features") !== null,
        themeScript: /\bShopify\.theme\b/.test(inlineScripts),
      },
      collectionDescriptionWords: collectionDescEl ? words(visibleText(collectionDescEl)) : null,
    },
  };
}

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** GET a same-origin text file. Only called with paths on the checked site's own origin. */
export async function fetchSameOrigin(
  fetcher: Fetcher,
  origin: string,
  path: string,
): Promise<FetchResult> {
  const target = new URL(path, origin);
  if (target.origin !== origin) return { ok: false, status: null, error: "cross-origin" };
  try {
    return await withTimeout(async (signal) => {
      const res = await fetcher(target.href, {
        method: "GET",
        credentials: "omit",
        cache: "no-store",
        redirect: "follow",
        signal,
      });
      const contentType = res.headers.get("content-type") ?? "";
      const text = res.ok ? (await res.text()).slice(0, TEXT_LIMIT) : undefined;
      return { ok: res.ok, status: res.status, text, contentType };
    });
  } catch (err) {
    return { ok: false, status: null, error: err instanceof Error ? err.name : "error" };
  }
}

/** HEAD the current page for its HTTP status and X-Robots-Tag header. */
export async function headPage(fetcher: Fetcher, href: string): Promise<HeadResult> {
  try {
    return await withTimeout(async (signal) => {
      const res = await fetcher(href, {
        method: "HEAD",
        credentials: "omit",
        cache: "no-store",
        redirect: "follow",
        signal,
      });
      return { status: res.status, ok: res.ok, xRobotsTag: res.headers.get("x-robots-tag") ?? "" };
    });
  } catch (err) {
    return {
      status: null,
      ok: false,
      xRobotsTag: "",
      error: err instanceof Error ? err.name : "error",
    };
  }
}

export async function collectFacts(
  doc: Document,
  href: string,
  fetcher: Fetcher,
): Promise<PageFacts> {
  const dom = collectDomFacts(doc, href);
  const pageUrl = href.split("#")[0];
  const [head, robots, sitemap, llms] = await Promise.all([
    headPage(fetcher, pageUrl),
    fetchSameOrigin(fetcher, dom.origin, "/robots.txt"),
    fetchSameOrigin(fetcher, dom.origin, "/sitemap.xml"),
    fetchSameOrigin(fetcher, dom.origin, "/llms.txt"),
  ]);
  return { ...dom, network: { head, robots, sitemap, llms } };
}
