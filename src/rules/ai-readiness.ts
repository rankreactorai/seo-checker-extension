import { nodesOfType } from "../lib/jsonld";
import { aiBotAccess } from "../lib/robots";
import type { Finding, PageFacts } from "../types";
import { textFileExists } from "./onpage";
import { ANSWER_MAX_WORDS, ANSWER_MIN_WORDS } from "./thresholds";

const QUESTION_RE =
  /(\?\s*$)|^(how|what|why|when|which|who|where|can|does|is|are|should|best)\b|\bvs\.?\b/i;

export function isQuestionHeading(text: string): boolean {
  return QUESTION_RE.test(text.trim());
}

function check(id: string, ok: boolean, pass: string, fail: string, fix: string): Finding {
  return ok ? { id, severity: "pass", text: pass } : { id, severity: "warn", text: fail, fix };
}

export function evaluateAi(f: PageFacts): { findings: Finding[]; ready: number; total: number } {
  const findings: Finding[] = [];
  const h1 = f.headings.find((h) => h.level === 1);
  const firstH2 = f.headings.find((h) => h.level === 2);
  const pWords = f.ai.firstParagraphWords;
  const shortAnswer = pWords >= ANSWER_MIN_WORDS && pWords <= ANSWER_MAX_WORDS;
  const questionLead =
    (h1 !== undefined && isQuestionHeading(h1.text)) ||
    (firstH2 !== undefined && isQuestionHeading(firstH2.text)) ||
    f.ai.firstParagraphAfterH1;
  findings.push(
    check(
      "ai-direct-answer",
      shortAnswer && questionLead,
      `The first paragraph is ${pWords} words, a direct answer near the top.`,
      pWords === 0
        ? "No opening paragraph found under the main heading."
        : `The first paragraph is ${pWords} words (a direct answer is ${ANSWER_MIN_WORDS}–${ANSWER_MAX_WORDS}).`,
      "Open with a short paragraph that answers the page's main question in plain words.",
    ),
  );

  const questionHeads = f.headings.filter((h) => h.level > 1 && isQuestionHeading(h.text)).length;
  findings.push(
    check(
      "ai-question-headings",
      questionHeads > 0,
      `${questionHeads} subheading${questionHeads === 1 ? " is" : "s are"} phrased as questions.`,
      "No subheadings are phrased as questions.",
      'Use H2/H3s that match how people ask, for example "How long does shipping take?"',
    ),
  );

  const faqSchema = nodesOfType(f.jsonLd, "FAQPage").length > 0;
  const faq = faqSchema || f.ai.detailsCount > 0 || f.ai.faqHeading;
  findings.push(
    check(
      "ai-faq",
      faq,
      faqSchema ? "FAQPage schema found." : "FAQ-style content found.",
      "No FAQ section or FAQPage schema found.",
      "Add a short FAQ with real customer questions, and FAQPage schema if your platform supports it.",
    ),
  );

  const identity =
    nodesOfType(f.jsonLd, "Organization").length > 0 ||
    nodesOfType(f.jsonLd, "WebSite").length > 0 ||
    nodesOfType(f.jsonLd, "OnlineStore").length > 0 ||
    Boolean(f.og.siteName);
  findings.push(
    check(
      "ai-identity",
      identity,
      "Brand identity is declared (Organization/WebSite schema or og:site_name).",
      "No Organization or WebSite schema, and no og:site_name.",
      "Add Organization schema with your brand name, logo and social profiles.",
    ),
  );

  const author =
    Boolean(f.ai.metaAuthor) ||
    f.ai.relAuthor ||
    f.ai.bylineElement ||
    f.jsonLd.nodes.some((n) => n.hasAuthor);
  findings.push(
    check(
      "ai-author",
      author,
      "Author or brand byline found.",
      "No author or byline signal found.",
      "Show who wrote or stands behind the page (a byline, author page or JSON-LD author).",
    ),
  );

  const fresh = f.ai.timeDatetime || f.jsonLd.nodes.some((n) => n.datePublished || n.dateModified);
  findings.push(
    check(
      "ai-freshness",
      fresh,
      "A published or updated date is marked up.",
      "No published or updated date found.",
      "Add datePublished/dateModified to the schema or a visible <time datetime> date.",
    ),
  );

  findings.push(
    check(
      "ai-lists",
      f.ai.listsOrTables > 0,
      "The main content uses lists or tables.",
      "No lists or tables in the main content.",
      "Use a bulleted list or a comparison table for steps, specs or options. They're easy to quote.",
    ),
  );

  if (textFileExists(f.network.robots)) {
    const access = aiBotAccess(f.network.robots.text ?? "");
    const blocked = access.filter((a) => a.blocked);
    findings.push(
      blocked.length === 0
        ? {
            id: "ai-crawlers",
            severity: "pass",
            text: "robots.txt doesn't block the AI crawlers we check (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot, Google-Extended).",
          }
        : {
            id: "ai-crawlers",
            severity: "warn",
            text: `robots.txt blocks ${blocked.map((b) => b.bot + (b.via === "wildcard" ? " (via User-agent: *)" : "")).join(", ")}.`,
            fix: "Blocking AI search crawlers such as OAI-SearchBot or PerplexityBot stops those tools from reading and citing the site. Remove the Disallow: / rule for any you want to allow.",
          },
    );
  } else {
    findings.push({
      id: "ai-crawlers",
      severity: "pass",
      text: "No robots.txt, so no AI crawlers are blocked.",
    });
  }

  findings.push(
    textFileExists(f.network.llms)
      ? { id: "ai-llms-txt", severity: "pass", text: "llms.txt found at the site root." }
      : {
          id: "ai-llms-txt",
          severity: "info",
          text: "No llms.txt at the site root (optional).",
          fix: "llms.txt is an optional, emerging convention: a short Markdown summary of your site for AI tools.",
        },
  );

  const scored = findings.filter((x) => x.id !== "ai-llms-txt");
  const ready = scored.filter((x) => x.severity === "pass").length;
  return { findings, ready, total: scored.length };
}
