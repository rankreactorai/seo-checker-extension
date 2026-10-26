import { allTypes } from "../lib/jsonld";
import { sitemapLines } from "../lib/robots";
import type { FetchResult, Finding, PageFacts } from "../types";
import {
  DESC_PASS_MAX,
  DESC_PASS_MIN,
  DESC_WARN_MAX,
  TITLE_PASS_MAX,
  TITLE_PASS_MIN,
  TITLE_WARN_MAX,
  WORDS_PASS,
  WORDS_WARN,
} from "./thresholds";

export function quote(value: string): string {
  const trimmed = value.length > 90 ? `${value.slice(0, 87)}...` : value;
  return `"${trimmed}"`;
}

export function hasNoindex(value: string): boolean {
  return /\b(noindex|none)\b/i.test(value);
}

/** True when a same-origin text file really exists (not an HTML catch-all page). */
export function textFileExists(res: FetchResult): boolean {
  if (!res.ok || res.text === undefined) return false;
  if (/text\/html/i.test(res.contentType ?? "")) return false;
  return !/^\s*<(!doctype|html)/i.test(res.text);
}

export function sitemapExists(res: FetchResult): boolean {
  if (!res.ok || res.text === undefined) return false;
  return /<(urlset|sitemapindex)\b/i.test(res.text);
}

function lengthFinding(
  id: "title" | "description",
  label: string,
  value: string,
  min: number,
  max: number,
  warnMax: number,
): Finding {
  const len = value.length;
  const copy = { label: `Copy ${label.toLowerCase()}`, value };
  if (len >= min && len <= max) {
    return { id, severity: "pass", text: `${label} is ${len} characters: ${quote(value)}`, copy };
  }
  const severity = len > warnMax ? "fail" : "warn";
  const fix =
    len < min
      ? `Lengthen it to ${min}–${max} characters and include the main keyword.`
      : `Shorten it to ${max} characters or fewer so Google doesn't cut it off.`;
  return {
    id,
    severity,
    text: `${label} is ${len} characters (recommended ${min}–${max}): ${quote(value)}`,
    fix,
    copy,
  };
}

export function evaluateTitle(f: PageFacts): Finding {
  if (!f.title) {
    return {
      id: "title",
      severity: "fail",
      text: "Title tag is missing.",
      fix: `Add a <title> of ${TITLE_PASS_MIN}–${TITLE_PASS_MAX} characters that names what the page offers.`,
    };
  }
  return lengthFinding(
    "title",
    "Title tag",
    f.title,
    TITLE_PASS_MIN,
    TITLE_PASS_MAX,
    TITLE_WARN_MAX,
  );
}

export function evaluateDescription(f: PageFacts): Finding {
  if (!f.metaDescription) {
    return {
      id: "description",
      severity: "fail",
      text: "Meta description is missing.",
      fix: `Add a meta description of ${DESC_PASS_MIN}–${DESC_PASS_MAX} characters that sums up the page and invites the click.`,
    };
  }
  return lengthFinding(
    "description",
    "Meta description",
    f.metaDescription,
    DESC_PASS_MIN,
    DESC_PASS_MAX,
    DESC_WARN_MAX,
  );
}

export function evaluateHeadings(f: PageFacts): Finding[] {
  const h1s = f.headings.filter((h) => h.level === 1);
  const h2s = f.headings.filter((h) => h.level === 2);
  const out: Finding[] = [];
  if (h1s.length === 0) {
    out.push({
      id: "h1",
      severity: "fail",
      text: "No H1 heading is present.",
      fix: "Add one H1 that states the page's main topic.",
    });
  } else if (h1s.length === 1) {
    out.push({ id: "h1", severity: "pass", text: `One H1 heading: ${quote(h1s[0].text)}` });
  } else {
    out.push({
      id: "h1",
      severity: "warn",
      text: `${h1s.length} H1 headings found (recommended 1). First: ${quote(h1s[0].text)}`,
      fix: "Keep one H1 and turn the others into H2s.",
    });
  }
  if (h2s.length === 0) {
    out.push({
      id: "h2",
      severity: "warn",
      text: "No H2 headings are present.",
      fix: "Break the content into sections with H2 subheadings.",
    });
  } else {
    out.push({
      id: "h2",
      severity: "pass",
      text: `${h2s.length} H2 heading${h2s.length === 1 ? "" : "s"} found.`,
    });
  }
  return out;
}

function normalizeUrl(u: string): string {
  try {
    const x = new URL(u);
    x.hash = "";
    return x.href.replace(/\/$/, "");
  } catch {
    return u;
  }
}

export function evaluateCanonical(f: PageFacts): Finding {
  if (!f.canonical) {
    return {
      id: "canonical",
      severity: "warn",
      text: "Canonical URL is missing.",
      fix: 'Add <link rel="canonical"> pointing to the preferred URL of this page.',
    };
  }
  const copy = { label: "Copy canonical", value: f.canonical };
  if (normalizeUrl(f.canonical) !== normalizeUrl(f.url)) {
    return {
      id: "canonical",
      severity: "info",
      text: `Canonical points to another URL: ${f.canonical}`,
      fix: "Fine if this page is a duplicate or variant. Otherwise point the canonical at this page.",
      copy,
    };
  }
  return { id: "canonical", severity: "pass", text: "Canonical URL points to this page.", copy };
}

export function evaluateIndexability(f: PageFacts): Finding {
  const sources: string[] = [];
  if (hasNoindex(f.metaRobots)) sources.push(`meta robots ${quote(f.metaRobots)}`);
  if (hasNoindex(f.googlebot)) sources.push(`meta googlebot ${quote(f.googlebot)}`);
  if (hasNoindex(f.network.head.xRobotsTag)) {
    sources.push(`X-Robots-Tag header ${quote(f.network.head.xRobotsTag)}`);
  }
  if (sources.length > 0) {
    return {
      id: "indexability",
      severity: "fail",
      text: `This page can't appear in Google: noindex found in ${sources.join(" and ")}.`,
      fix: "Remove noindex if you want this page in search results.",
    };
  }
  const headNote = f.network.head.status === null ? " (the response header couldn't be read)" : "";
  return {
    id: "indexability",
    severity: "pass",
    text: `No noindex in meta robots or the X-Robots-Tag header${headNote}.`,
  };
}

export function evaluateStatus(f: PageFacts): Finding {
  const { status } = f.network.head;
  if (status === null) {
    return {
      id: "status",
      severity: "info",
      text: "Couldn't read the HTTP status (the site blocked the check request).",
    };
  }
  if (status >= 200 && status < 300) {
    return { id: "status", severity: "pass", text: `HTTP status is ${status}.` };
  }
  return {
    id: "status",
    severity: "warn",
    text: `HTTP status is ${status}.`,
    fix: "Search engines expect a 200 for pages you want indexed. Fix the error or redirect.",
  };
}

export function evaluateImages(f: PageFacts): Finding[] {
  const { images } = f;
  const out: Finding[] = [];
  if (images.total === 0) {
    out.push({ id: "alt", severity: "pass", text: "No images on the page." });
  } else if (images.missing === 0) {
    out.push({
      id: "alt",
      severity: "pass",
      text:
        images.decorative === 0
          ? `All ${images.total} images have alt text.`
          : `All ${images.total} images have an alt attribute.`,
    });
  } else {
    const covered = images.total - images.missing;
    out.push({
      id: "alt",
      severity: covered / images.total >= 0.5 ? "warn" : "fail",
      text: `${covered} of ${images.total} images have an alt attribute (${images.missing} missing).`,
      fix: 'Describe each meaningful image in a short alt text. Use alt="" only for decoration.',
    });
  }
  if (images.decorative > 0) {
    out.push({
      id: "alt-decorative",
      severity: "info",
      text:
        images.decorative === 1
          ? "1 image uses empty alt text (decorative)."
          : `${images.decorative} images use empty alt text (decorative).`,
    });
  }
  if (images.decorativeLinkOnly > 0) {
    out.push({
      id: "alt-link",
      severity: "info",
      text:
        images.decorativeLinkOnly === 1
          ? "1 decorative image is the only content of a link and may need accessible text."
          : `${images.decorativeLinkOnly} decorative images are the only content of a link and may need accessible text.`,
      fix: "Give linked images alt text that says where the link goes.",
    });
  }
  return out;
}

export function evaluateSchema(f: PageFacts): Finding[] {
  const out: Finding[] = [];
  const types = allTypes(f.jsonLd);
  if (f.jsonLd.invalid > 0) {
    out.push({
      id: "schema-invalid",
      severity: "warn",
      text: `${f.jsonLd.invalid} JSON-LD block${f.jsonLd.invalid === 1 ? " is" : "s are"} not valid JSON. Google ignores broken JSON-LD.`,
      fix: "Fix the JSON syntax (often a trailing comma or an unescaped quote).",
    });
  }
  if (types.length > 0) {
    out.push({
      id: "schema",
      severity: "pass",
      text: `Schema types found: ${types.join(", ")}.`,
      copy: { label: "Copy types", value: types.join(", ") },
    });
  } else {
    out.push({
      id: "schema",
      severity: "warn",
      text: "No JSON-LD schema found.",
      fix: "Add JSON-LD that matches the page (Product, Article, FAQPage or Organization).",
    });
  }
  return out;
}

export function evaluateWords(f: PageFacts): Finding {
  if (f.wordCount < WORDS_WARN) {
    return {
      id: "words",
      severity: "fail",
      text: `Visible word count is ${f.wordCount} (thin content).`,
      fix: "Add useful text: what it is, who it's for and answers to common questions.",
    };
  }
  if (f.wordCount < WORDS_PASS) {
    return {
      id: "words",
      severity: "warn",
      text: `Visible word count is ${f.wordCount} (recommended ${WORDS_PASS}+).`,
      fix: "Expand the main content so the page fully answers the searcher's question.",
    };
  }
  return { id: "words", severity: "pass", text: `Visible word count is ${f.wordCount}.` };
}

export function evaluateLinks(f: PageFacts): Finding {
  const { internal, external, nofollow } = f.links;
  if (internal === 0) {
    return {
      id: "links",
      severity: "warn",
      text: `No internal links (${external} external, ${nofollow} nofollow).`,
      fix: "Link to related pages on your site so visitors and crawlers can find them.",
    };
  }
  return {
    id: "links",
    severity: "info",
    text: `${internal} internal, ${external} external and ${nofollow} nofollow links.`,
  };
}

export function evaluateSocial(f: PageFacts): Finding {
  const missing = [
    !f.og.title && "og:title",
    !f.og.description && "og:description",
    !f.og.image && "og:image",
  ].filter(Boolean) as string[];
  if (missing.length > 0) {
    return {
      id: "social",
      severity: "warn",
      text: `Open Graph tags missing: ${missing.join(", ")}.`,
      fix: "Add them so links to this page show a proper preview when shared.",
    };
  }
  return { id: "social", severity: "pass", text: "og:title, og:description and og:image are set." };
}

export function evaluateLang(f: PageFacts): Finding {
  if (!f.lang) {
    return {
      id: "lang",
      severity: "warn",
      text: "The <html> lang attribute is missing.",
      fix: 'Set it, for example <html lang="en">.',
    };
  }
  return { id: "lang", severity: "pass", text: `Page language is set: ${f.lang}.` };
}

export function evaluateRobotsAndSitemap(f: PageFacts): Finding[] {
  const out: Finding[] = [];
  const robotsOk = textFileExists(f.network.robots);
  const lines = robotsOk ? sitemapLines(f.network.robots.text ?? "") : [];
  if (robotsOk) {
    out.push({
      id: "robots-txt",
      severity: "pass",
      text:
        lines.length > 0
          ? `robots.txt found, with Sitemap: ${lines.slice(0, 3).join(", ")}${lines.length > 3 ? "…" : ""}`
          : "robots.txt found (no Sitemap: line).",
      fix: lines.length > 0 ? undefined : "Add a Sitemap: line to robots.txt.",
    });
  } else {
    out.push({
      id: "robots-txt",
      severity: "warn",
      text: "No robots.txt found at the site root.",
      fix: "Add /robots.txt with a Sitemap: line so crawlers find your pages.",
    });
  }
  if (sitemapExists(f.network.sitemap)) {
    out.push({ id: "sitemap", severity: "pass", text: "sitemap.xml found at the site root." });
  } else if (lines.length > 0) {
    out.push({
      id: "sitemap",
      severity: "pass",
      text: "No /sitemap.xml, but robots.txt lists a sitemap.",
    });
  } else {
    out.push({
      id: "sitemap",
      severity: "warn",
      text: "No sitemap found (/sitemap.xml or a Sitemap: line in robots.txt).",
      fix: "Publish an XML sitemap and submit it in Google Search Console.",
    });
  }
  return out;
}

export function evaluateOnPage(f: PageFacts): Finding[] {
  return [
    evaluateTitle(f),
    evaluateDescription(f),
    evaluateIndexability(f),
    evaluateStatus(f),
    ...evaluateHeadings(f),
    evaluateCanonical(f),
    ...evaluateImages(f),
    ...evaluateSchema(f),
    evaluateWords(f),
    evaluateLinks(f),
    evaluateSocial(f),
    evaluateLang(f),
    ...evaluateRobotsAndSitemap(f),
  ];
}
