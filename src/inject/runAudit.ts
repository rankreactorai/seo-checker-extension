// Injected into the active tab with chrome.scripting.executeScript({ files: ["inject.js"] }).
// Vite bundles this file as one IIFE. The value of the script's last expression (a Promise of
// the facts JSON) is what executeScript returns to the popup.
import { collectFacts } from "./collect";

export const result = collectFacts(document, location.href, (input, init) => fetch(input, init));
