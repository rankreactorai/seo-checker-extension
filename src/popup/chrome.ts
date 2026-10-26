import type { PageFacts } from "../types";

const RESTRICTED_PROTOCOLS = [
  "chrome:",
  "chrome-extension:",
  "chrome-untrusted:",
  "chrome-search:",
  "edge:",
  "extension:",
  "about:",
  "view-source:",
  "devtools:",
  "file:",
  "data:",
  "blob:",
  "javascript:",
];

const RESTRICTED_HOSTS = ["chromewebstore.google.com", "microsoftedge.microsoft.com"];

/** Pages the browser never lets an extension script (or where a check makes no sense). */
export function isRestrictedUrl(url: string | undefined): boolean {
  if (!url) return true;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return true;
  }
  if (RESTRICTED_PROTOCOLS.includes(u.protocol)) return true;
  if (u.protocol !== "http:" && u.protocol !== "https:") return true;
  if (RESTRICTED_HOSTS.includes(u.hostname)) return true;
  if (u.hostname === "chrome.google.com" && u.pathname.startsWith("/webstore")) return true;
  if (/\.pdf$/i.test(u.pathname)) return true;
  return false;
}

export type Target = { tabId: number; url: string | undefined };

/**
 * The tab to check: the active tab of the window the popup belongs to.
 * `?tabId=` is only used by the local end-to-end test, which opens popup.html as a page.
 */
export async function getTarget(): Promise<Target | null> {
  const param = new URLSearchParams(location.search).get("tabId");
  if (param && /^\d+$/.test(param)) {
    const tab = await chrome.tabs.get(Number(param));
    return tab.id === undefined ? null : { tabId: tab.id, url: tab.url };
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id === undefined) return null;
  return { tabId: tab.id, url: tab.url };
}

function looksLikeFacts(v: unknown): v is PageFacts {
  return typeof v === "object" && v !== null && "url" in v && "headings" in v && "network" in v;
}

export async function runAudit(tabId: number): Promise<PageFacts> {
  const [first] = await chrome.scripting.executeScript({
    target: { tabId },
    files: ["inject.js"],
  });
  const result: unknown = first?.result;
  if (!looksLikeFacts(result)) throw new Error("The page didn't return any results.");
  return result;
}

export function openLink(url: string): void {
  void chrome.tabs.create({ url });
}

export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = value;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}
