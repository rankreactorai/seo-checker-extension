import { expect, test } from "@playwright/test";
import { launchWithExtension, openPopupFor } from "./extension.mjs";
import { startServer } from "./server.mjs";

let server;
let origin;
let context;
let extensionId;
const requests = [];

test.beforeAll(async () => {
  ({ server, origin } = await startServer());
  ({ context, extensionId } = await launchWithExtension());
  context.on("request", (r) => requests.push(r.url()));
});

test.afterAll(async () => {
  await context?.close();
  server?.close();
});

test("checks a Shopify product page", async () => {
  const { popup } = await openPopupFor(
    context,
    extensionId,
    `${origin}/products/stoneware-pour-over-set`,
  );
  await expect(popup.locator(".summary")).toBeVisible();
  await expect(popup.locator('[data-id="title"]')).toContainText("Title tag is");
  await expect(popup.locator('[data-id="indexability"]')).toContainText("No noindex");
  await expect(popup.locator('[data-id="sitemap"]')).toContainText("sitemap.xml found");
  await popup.getByRole("tab", { name: "Shopify" }).click();
  await expect(popup.locator('[data-id="shopify-product-alt"]')).toContainText(
    "1 of 3 product images",
  );
  await popup.getByRole("tab", { name: "AI answers" }).click();
  await expect(popup.locator(".disclaimer")).toContainText("hygiene check, not a guarantee");
  await expect(popup.locator('[data-id="ai-crawlers"]')).toContainText("GPTBot");
});

test("reads the X-Robots-Tag header", async () => {
  const { popup } = await openPopupFor(context, extensionId, `${origin}/header-noindex`);
  await expect(popup.locator('[data-id="indexability"]')).toContainText("X-Robots-Tag");
  await expect(popup.getByRole("tab", { name: "Shopify" })).toHaveCount(0);
});

test("re-check runs again", async () => {
  const { popup } = await openPopupFor(context, extensionId, `${origin}/thank-you`);
  await expect(popup.locator('[data-id="indexability"]')).toContainText("can't appear in Google");
  await popup.getByRole("button", { name: "Re-check" }).click();
  await expect(popup.locator('[data-id="indexability"]')).toContainText("can't appear in Google");
});

test("shows the restricted-page message", async () => {
  const page = await context.newPage();
  await page.goto("about:blank");
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  // The popup opened as a page audits its own (extension) tab, which is restricted.
  await expect(popup.locator(".restricted")).toContainText("Open a regular web page");
});

test("CTA links are plain rankreactor.ai links with UTM tags only", async () => {
  const { popup } = await openPopupFor(context, extensionId, `${origin}/`);
  const hrefs = await popup.locator("a[href]").evaluateAll((as) => as.map((a) => a.href));
  expect(hrefs.length).toBeGreaterThan(1);
  for (const href of hrefs) {
    const u = new URL(href);
    expect(u.hostname).toBe("rankreactor.ai");
    expect(href).not.toContain("localhost");
    expect(u.searchParams.get("utm_source")).toBe("chrome-extension");
  }
});

test("no request leaves localhost", async () => {
  const outside = requests.filter(
    (u) => !u.startsWith(origin) && !u.startsWith("chrome-extension://") && u !== "about:blank",
  );
  expect(outside).toEqual([]);
});
