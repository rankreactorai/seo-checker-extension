import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectDomFacts } from "../src/inject/collect";
import type { FetchResult, HeadResult, PageFacts } from "../src/types";

export function fixtureDoc(name: string): Document {
  const html = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "fixtures", name),
    "utf8",
  );
  return new DOMParser().parseFromString(html, "text/html");
}

const missing: FetchResult = { ok: false, status: 404, text: undefined };

export type Network = Partial<{
  head: Partial<HeadResult>;
  robots: FetchResult;
  sitemap: FetchResult;
  llms: FetchResult;
}>;

export function factsFor(name: string, url: string, network: Network = {}): PageFacts {
  const dom = collectDomFacts(fixtureDoc(name), url);
  return {
    ...dom,
    network: {
      head: { status: 200, ok: true, xRobotsTag: "", ...network.head },
      robots: network.robots ?? missing,
      sitemap: network.sitemap ?? missing,
      llms: network.llms ?? missing,
    },
  };
}

export function text(body: string, contentType = "text/plain"): FetchResult {
  return { ok: true, status: 200, text: body, contentType };
}

export function byId<T extends { id: string }>(list: T[], id: string): T {
  const found = list.find((x) => x.id === id);
  if (!found) throw new Error(`No finding with id ${id}. Got: ${list.map((x) => x.id).join(", ")}`);
  return found;
}
