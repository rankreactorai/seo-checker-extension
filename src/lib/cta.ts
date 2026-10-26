import type { Finding } from "../types";

/**
 * Every link out of the extension is built here. Links carry campaign (UTM) parameters only.
 * They never include the page, URL or domain being checked.
 */
export const SITE = "https://rankreactor.ai";

export type CtaPath = "/" | "/pricing" | "/tools" | "/privacy-policy";
export type CtaSlot =
  "footer" | "thin-content" | "shopify" | "ai-answers" | "title-tag" | "privacy" | "homepage_url";

const ALLOWED_PATHS: readonly CtaPath[] = ["/", "/pricing", "/tools", "/privacy-policy"];
const HASH_RE = /^[a-z0-9-]+$/;

export const UTM_BASE = {
  utm_source: "chrome-extension",
  utm_medium: "extension",
  utm_campaign: "seo-checker",
} as const;

export function buildCtaUrl(path: CtaPath, slot: CtaSlot, hash?: string): string {
  if (!ALLOWED_PATHS.includes(path)) throw new Error(`Path not allowed: ${path}`);
  if (hash !== undefined && (path !== "/tools" || !HASH_RE.test(hash))) {
    throw new Error(`Hash not allowed: ${hash}`);
  }
  const params = new URLSearchParams({ ...UTM_BASE, utm_content: slot });
  // Query string goes before the hash.
  return `${SITE}${path}?${params.toString()}${hash ? `#${hash}` : ""}`;
}

export type Cta = { slot: CtaSlot; label: string; url: string };

export const FOOTER_CTA: Cta = {
  slot: "footer",
  label: "Get this site's buyer keywords and auto-written articles →",
  url: buildCtaUrl("/", "footer"),
};

export const PRIVACY_LINK: Cta = {
  slot: "privacy",
  label: "Privacy",
  url: buildCtaUrl("/privacy-policy", "privacy"),
};

const CTAS = {
  titleTag: {
    slot: "title-tag",
    label: "Try the free Title Tag Optimizer →",
    url: buildCtaUrl("/tools", "title-tag", "title-tag"),
  },
  thinContent: {
    slot: "thin-content",
    label: "RankReactor writes and publishes SEO articles to your blog daily →",
    url: buildCtaUrl("/pricing", "thin-content"),
  },
  shopify: {
    slot: "shopify",
    label: "Publish SEO articles straight to your Shopify blog →",
    url: buildCtaUrl("/", "shopify"),
  },
  aiAnswers: {
    slot: "ai-answers",
    label: "Write pages that AI answers can quote →",
    url: buildCtaUrl("/", "ai-answers"),
  },
} satisfies Record<string, Cta>;

const failing = (f: Finding) => f.severity === "fail" || f.severity === "warn";
const SEVERITY_RANK = { fail: 0, warn: 1, info: 2, pass: 3 } as const;

/** At most one context CTA per tab, picked by the top failing finding. */
export function pickContextCta(
  tab: "overview" | "shopify" | "ai",
  findings: Finding[],
): Cta | null {
  if (tab === "ai") return CTAS.aiAnswers;
  if (tab === "shopify") {
    const noBlog = findings.some((f) => f.id === "shopify-blog" && f.severity !== "pass");
    return noBlog ? CTAS.thinContent : CTAS.shopify;
  }
  const relevant = findings
    .filter((f) => ["title", "description", "words"].includes(f.id) && failing(f))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const top = relevant[0];
  if (!top) return null;
  return top.id === "words" ? CTAS.thinContent : CTAS.titleTag;
}
