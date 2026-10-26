// Tiny local server for the e2e test and screenshots. Serves the HTML fixtures at
// Shopify-like paths, plus robots.txt and sitemap.xml. Everything stays on localhost.
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const fixtures = fileURLToPath(new URL("../tests/fixtures/", import.meta.url));

const ROUTES = {
  "/products/stoneware-pour-over-set": "shopify-product.html",
  "/collections/mugs": "shopify-collection.html",
  "/collections/mugs/products/speckled-mug": "shopify-collection-product.html",
  "/guides/choose-a-pour-over-dripper": "blog-post.html",
  "/thank-you": "noindex.html",
  "/header-noindex": "blog-post.html",
  "/about": "broken-jsonld.html",
  "/": "thin-page.html",
};

export function startServer(port = 0) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const forwarded = req.headers["x-forwarded-host"];
    const origin = forwarded ? `http://${forwarded}` : `http://localhost:${server.address().port}`;
    const send = (status, type, body, headers = {}) => {
      res.writeHead(status, { "content-type": type, ...headers });
      res.end(req.method === "HEAD" ? undefined : body);
    };
    if (url.pathname === "/robots.txt") {
      return send(
        200,
        "text/plain",
        `User-agent: *\nDisallow: /cart\n\nUser-agent: GPTBot\nDisallow: /\n\nSitemap: ${origin}/sitemap.xml\n`,
      );
    }
    if (url.pathname === "/sitemap.xml") {
      return send(
        200,
        "application/xml",
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc></url></urlset>`,
      );
    }
    if (url.pathname.startsWith("/images/")) {
      try {
        const svg = await readFile(join(fixtures, url.pathname.replace(/^\/+/, "")));
        return send(200, "image/svg+xml", svg);
      } catch {
        return send(404, "text/plain", "not found");
      }
    }
    const file = ROUTES[url.pathname];
    if (!file) return send(404, "text/html", "<!doctype html><title>Not found</title>");
    const html = await readFile(join(fixtures, file), "utf8");
    const headers = url.pathname === "/header-noindex" ? { "x-robots-tag": "noindex" } : {};
    return send(200, "text/html; charset=utf-8", html, headers);
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      resolve({ server, origin: `http://localhost:${server.address().port}` });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { origin } = await startServer(Number(process.env.PORT ?? 4173));
  console.log(`Fixtures at ${origin}`);
}
