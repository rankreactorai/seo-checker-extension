import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { FOOTER_CTA, PRIVACY_LINK, pickContextCta, type Cta } from "../lib/cta";
import { evaluate } from "../rules/evaluate";
import type { Evaluation, Finding, Heading, PageFacts, Severity } from "../types";
import { copyText, getTarget, isRestrictedUrl, openLink, runAudit } from "./chrome";

type TabId = "overview" | "shopify" | "ai";
type State =
  | { kind: "loading" }
  | { kind: "restricted" }
  | { kind: "error"; message: string }
  | { kind: "done"; facts: PageFacts; result: Evaluation };

const SEVERITY_LABEL: Record<Severity, string> = {
  fail: "Fix",
  warn: "Improve",
  info: "Info",
  pass: "Good",
};
const ORDER: Record<Severity, number> = { fail: 0, warn: 1, info: 2, pass: 3 };

function sortFindings(list: Finding[]): Finding[] {
  return [...list].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}

function Link({ cta, className }: { cta: Cta; className?: string }) {
  return (
    <a
      href={cta.url}
      class={className}
      onClick={(e) => {
        e.preventDefault();
        openLink(cta.url);
      }}
    >
      {cta.label}
    </a>
  );
}

function CopyButton({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      class="copy"
      onClick={async () => {
        setDone(await copyText(value));
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}

function FindingRow({ f }: { f: Finding }) {
  return (
    <li class={`finding sev-${f.severity}`} data-id={f.id}>
      <span class="badge">{SEVERITY_LABEL[f.severity]}</span>
      <div class="finding-body">
        <p class="finding-text">{f.text}</p>
        {f.fix && f.severity !== "pass" ? <p class="fix">{f.fix}</p> : null}
        {f.copy ? <CopyButton label={f.copy.label} value={f.copy.value} /> : null}
      </div>
    </li>
  );
}

function Findings({ list }: { list: Finding[] }) {
  return (
    <ul class="findings">
      {sortFindings(list).map((f) => (
        <FindingRow key={f.id} f={f} />
      ))}
    </ul>
  );
}

function Summary({ list }: { list: Finding[] }) {
  const count = (s: Severity) => list.filter((f) => f.severity === s).length;
  return (
    <div class="summary">
      <span class="chip sev-fail">{count("fail")} to fix</span>
      <span class="chip sev-warn">{count("warn")} to improve</span>
      <span class="chip sev-pass">{count("pass")} good</span>
    </div>
  );
}

function displayUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    return [u.hostname, ...parts].join(" › ");
  } catch {
    return url;
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function SerpPreview({ facts }: { facts: PageFacts }) {
  return (
    <section class="card preview" aria-label="Search result preview">
      <h3 class="card-title">Google-style preview</h3>
      <div class="serp">
        <div class="serp-url">{displayUrl(facts.url)}</div>
        <div class="serp-title">{truncate(facts.title || "(no title)", 60)}</div>
        <div class="serp-desc">
          {facts.metaDescription
            ? truncate(facts.metaDescription, 160)
            : "No meta description. Google will pick text from the page."}
        </div>
      </div>
    </section>
  );
}

function SocialPreview({ facts }: { facts: PageFacts }) {
  const title = facts.og.title || facts.twitter.title || facts.title;
  const desc = facts.og.description || facts.twitter.description || facts.metaDescription || "";
  const image = facts.og.image || facts.twitter.image;
  const host = URL.canParse(facts.url) ? new URL(facts.url).hostname : "";
  return (
    <section class="card preview" aria-label="Social share preview">
      <h3 class="card-title">Share preview</h3>
      <div class="social">
        {/* The image is not loaded, so the extension never requests other servers. */}
        <div class={`social-img ${image ? "has-img" : ""}`}>
          {image ? "og:image is set" : "No og:image"}
        </div>
        <div class="social-meta">
          <div class="social-host">{host}</div>
          <div class="social-title">{truncate(title || "(no title)", 70)}</div>
          {desc ? <div class="social-desc">{truncate(desc, 110)}</div> : null}
        </div>
      </div>
    </section>
  );
}

function Outline({ headings }: { headings: Heading[] }) {
  if (headings.length === 0) return null;
  const text = headings.map((h) => `${"  ".repeat(h.level - 1)}H${h.level} ${h.text}`).join("\n");
  return (
    <details class="card outline">
      <summary class="card-title">Heading outline ({headings.length})</summary>
      <ol>
        {headings.slice(0, 60).map((h, i) => (
          <li key={i} class={`lvl-${h.level}`}>
            <span class="lvl">H{h.level}</span> {h.text || "(empty)"}
          </li>
        ))}
      </ol>
      <CopyButton label="Copy outline" value={text} />
    </details>
  );
}

function ContextCta({ cta }: { cta: Cta | null }) {
  if (!cta) return null;
  return (
    <div class="context-cta">
      <Link cta={cta} />
    </div>
  );
}

export function App() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [tab, setTab] = useState<TabId>("overview");

  const run = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const target = await getTarget();
      if (!target || isRestrictedUrl(target.url)) {
        setState({ kind: "restricted" });
        return;
      }
      const facts = await runAudit(target.tabId);
      setState({ kind: "done", facts, result: evaluate(facts) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/cannot (access|be scripted)|chrome:\/\/|extensions gallery|permission/i.test(message)) {
        setState({ kind: "restricted" });
      } else {
        setState({ kind: "error", message });
      }
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  const done = state.kind === "done" ? state : null;
  const shopifyDetected = done?.result.shopify.detected ?? false;
  useEffect(() => {
    if (tab === "shopify" && !shopifyDetected) setTab("overview");
  }, [tab, shopifyDetected]);

  const tabs = useMemo(() => {
    const list: { id: TabId; label: string }[] = [{ id: "overview", label: "Overview" }];
    if (shopifyDetected) list.push({ id: "shopify", label: "Shopify" });
    list.push({ id: "ai", label: "AI answers" });
    return list;
  }, [shopifyDetected]);

  return (
    <div class="popup">
      <header class="top">
        <img src="icons/32.png" width={20} height={20} alt="" />
        <div class="brand">
          <strong>RankReactorAI</strong> SEO Checker
        </div>
        <button
          type="button"
          class="recheck"
          onClick={() => void run()}
          disabled={state.kind === "loading"}
        >
          Re-check
        </button>
      </header>

      {state.kind === "loading" ? <p class="status">Checking this page…</p> : null}
      {state.kind === "restricted" ? (
        <div class="status restricted">
          <p>
            <strong>This page can't be checked.</strong>
          </p>
          <p>Open a regular web page and click again.</p>
          <p class="muted">
            Browser pages, extension stores, PDFs and local files can't be read by extensions.
          </p>
        </div>
      ) : null}
      {state.kind === "error" ? (
        <div class="status error">
          <p>
            <strong>The check didn't finish.</strong>
          </p>
          <p class="muted">{state.message}</p>
          <p>Reload the page and click Re-check.</p>
        </div>
      ) : null}

      {done ? (
        <>
          <div class="page-url" title={done.facts.url}>
            {truncate(done.facts.url, 70)}
          </div>
          <nav class="tabs" role="tablist">
            {tabs.map((t) => (
              <button
                type="button"
                role="tab"
                key={t.id}
                aria-selected={tab === t.id}
                class={tab === t.id ? "active" : ""}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <main class="panel">
            {tab === "overview" ? (
              <>
                <Summary list={done.result.overview} />
                <SerpPreview facts={done.facts} />
                <Findings list={done.result.overview} />
                <SocialPreview facts={done.facts} />
                <Outline headings={done.facts.headings} />
                <ContextCta cta={pickContextCta("overview", done.result.overview)} />
              </>
            ) : null}
            {tab === "shopify" ? (
              <>
                <p class="lede">
                  Shopify store detected · page type:{" "}
                  <strong>{done.result.shopify.pageType}</strong>
                </p>
                <Findings list={done.result.shopify.findings} />
                <ContextCta cta={pickContextCta("shopify", done.result.shopify.findings)} />
              </>
            ) : null}
            {tab === "ai" ? (
              <>
                <div class="readiness">
                  <span class="score">
                    {done.result.ai.ready} / {done.result.ai.total}
                  </span>
                  <span>AI-answer readiness checks passed</span>
                </div>
                <p class="disclaimer">
                  This is a hygiene check, not a guarantee. No tool can promise that ChatGPT,
                  Perplexity or Google AI Overviews will cite a page.
                </p>
                <Findings list={done.result.ai.findings} />
                <ContextCta cta={pickContextCta("ai", done.result.ai.findings)} />
              </>
            ) : null}
          </main>
        </>
      ) : null}

      <footer class="bottom">
        <Link cta={FOOTER_CTA} className="footer-cta" />
        <div class="fineprint">
          Runs locally in your browser · no account · <Link cta={PRIVACY_LINK} />
        </div>
      </footer>
    </div>
  );
}
