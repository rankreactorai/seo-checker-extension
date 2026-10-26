// Builds dist/: the popup (Vite + Preact), the injected audit IIFE and manifest.json.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

await build({ root, configFile: `${root}/vite.config.ts`, logLevel: "warn" });

// The audit script is injected with chrome.scripting.executeScript({ files: ["inject.js"] }).
// executeScript returns the value of the script's last expression, so the footer ends the
// file with the Promise of facts returned by runAudit.ts.
await build({
  root,
  configFile: false,
  logLevel: "warn",
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    minify: false,
    sourcemap: false,
    target: "chrome110",
    lib: {
      entry: `${root}/src/inject/runAudit.ts`,
      formats: ["iife"],
      name: "__rankreactorSeoChecker",
      fileName: () => "inject.js",
    },
    rollupOptions: {
      output: { footer: "__rankreactorSeoChecker.result;" },
    },
  },
});

const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
manifest.version = pkg.version;
await writeFile(`${root}/dist/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Built dist/ (version ${pkg.version})`);
