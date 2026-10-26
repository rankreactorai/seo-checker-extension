// Loads the built extension into Playwright's Chromium for the e2e test and screenshots.
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));

/** Chrome derives an unpacked extension's ID from its absolute path. */
function extensionIdForPath(path) {
  const hex = createHash("sha256").update(path).digest("hex").slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
}

/**
 * Test-only copy of dist/ that adds a localhost host permission. A real user grants access
 * by clicking the toolbar button (activeTab), which automation can't do. The shipped
 * manifest is unchanged.
 */
export async function launchWithExtension({ hosts = [], deviceScaleFactor = 1 } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "rr-ext-"));
  await cp(dist, dir, { recursive: true });
  const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
  manifest.host_permissions = ["http://localhost/*", ...hosts];
  await writeFile(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    deviceScaleFactor,
    args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`],
  });
  return { context, extensionId: extensionIdForPath(dir) };
}

/** Opens the fixture page, then popup.html pointed at that tab. */
export async function openPopupFor(
  context,
  extensionId,
  url,
  viewport = { width: 380, height: 600 },
) {
  const page = await context.newPage();
  await page.goto(url);
  const tabId = await getTabId(context, extensionId, url);
  const popup = await context.newPage();
  await popup.setViewportSize(viewport);
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tabId=${tabId}`);
  return { page, popup };
}

async function getTabId(context, extensionId, url) {
  const helper = await context.newPage();
  await helper.goto(`chrome-extension://${extensionId}/popup.html?tabId=0`).catch(() => {});
  const id = await helper.evaluate(async (u) => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((t) => t.url === u)?.id ?? null;
  }, url);
  await helper.close();
  if (id === null) throw new Error(`No tab for ${url}`);
  return id;
}
