import type { Evaluation, PageFacts } from "../types";
import { evaluateAi } from "./ai-readiness";
import { evaluateOnPage } from "./onpage";
import { evaluateShopify } from "./shopify";

/** Pure function: facts collected from the page in, findings out. */
export function evaluate(facts: PageFacts): Evaluation {
  return {
    overview: evaluateOnPage(facts),
    shopify: evaluateShopify(facts),
    ai: evaluateAi(facts),
  };
}
