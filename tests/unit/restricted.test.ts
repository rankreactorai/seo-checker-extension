import { describe, expect, it } from "vitest";
import { isRestrictedUrl } from "../../src/popup/chrome";

describe("restricted pages", () => {
  it.each([
    undefined,
    "chrome://extensions",
    "edge://settings",
    "about:blank",
    "view-source:https://a.test/",
    "file:///tmp/a.html",
    "https://chromewebstore.google.com/detail/x",
    "https://chrome.google.com/webstore/detail/x",
    "https://microsoftedge.microsoft.com/addons/detail/x",
    "https://a.test/guide.pdf",
  ])("blocks %s", (url) => {
    expect(isRestrictedUrl(url)).toBe(true);
  });

  it.each(["https://a.test/", "http://localhost:8080/products/x"])("allows %s", (url) => {
    expect(isRestrictedUrl(url)).toBe(false);
  });
});
