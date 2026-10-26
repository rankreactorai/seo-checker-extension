export type Severity = "pass" | "warn" | "fail" | "info";

export type Finding = {
  id: string;
  severity: Severity;
  /** What we found, in plain English. */
  text: string;
  /** One-line fix tip. Omitted for passes that need no action. */
  fix?: string;
  /** Optional value the user can copy (for example the current title). */
  copy?: { label: string; value: string };
};

export type JsonLdNode = {
  types: string[];
  hasAuthor: boolean;
  datePublished?: string;
  dateModified?: string;
  offers?: { price?: string; priceCurrency?: string; availability?: string };
  hasAggregateRating: boolean;
};

export type JsonLdFacts = {
  blocks: number;
  invalid: number;
  nodes: JsonLdNode[];
};

export type FetchResult = {
  ok: boolean;
  status: number | null;
  /** Body text (truncated), only for text resources. */
  text?: string;
  contentType?: string;
  error?: string;
};

export type HeadResult = {
  status: number | null;
  ok: boolean;
  xRobotsTag: string;
  error?: string;
};

export type ShopifySignals = {
  cdnAsset: boolean;
  shopifyMeta: boolean;
  featuresEl: boolean;
  themeScript: boolean;
};

export type Heading = { level: 1 | 2 | 3; text: string };

export type PageFacts = {
  url: string;
  origin: string;
  pathname: string;
  title: string;
  metaDescription: string | null;
  lang: string;
  canonical: string | null;
  metaRobots: string;
  googlebot: string;
  headings: Heading[];
  images: {
    total: number;
    withAlt: number;
    missing: number;
    decorative: number;
    decorativeLinkOnly: number;
    productTotal: number;
    productMissing: number;
  };
  jsonLd: JsonLdFacts;
  wordCount: number;
  links: { internal: number; external: number; nofollow: number; blogLink: boolean };
  og: { title: string; description: string; image: string; siteName: string };
  twitter: { card: string; title: string; description: string; image: string };
  ai: {
    firstParagraphWords: number;
    firstParagraphAfterH1: boolean;
    detailsCount: number;
    faqHeading: boolean;
    metaAuthor: string;
    relAuthor: boolean;
    bylineElement: boolean;
    timeDatetime: boolean;
    listsOrTables: number;
  };
  shopify: {
    signals: ShopifySignals;
    collectionDescriptionWords: number | null;
  };
  network: {
    head: HeadResult;
    robots: FetchResult;
    sitemap: FetchResult;
    llms: FetchResult;
  };
};

export type ShopifyPageType =
  "product" | "collection-product" | "collection" | "blog" | "page" | "home" | "other";

export type Evaluation = {
  overview: Finding[];
  shopify: { detected: boolean; pageType: ShopifyPageType; findings: Finding[] };
  ai: { findings: Finding[]; ready: number; total: number };
};
