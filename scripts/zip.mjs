// Zips dist/ into release/rankreactor-seo-checker-<version>.zip with manifest.json at the root.
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const manifest = JSON.parse(await readFile(join(dist, "manifest.json"), "utf8"));
if (manifest.version !== pkg.version) {
  throw new Error(
    `dist/manifest.json is ${manifest.version}, package.json is ${pkg.version}. Run npm run build.`,
  );
}

async function walk(dir) {
  const out = [];
  for (const name of (await readdir(dir)).sort()) {
    const full = join(dir, name);
    if ((await stat(full)).isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

const files = {};
// Fixed mtime keeps the zip reproducible.
const mtime = new Date("2026-01-01T00:00:00Z");
for (const file of await walk(dist)) {
  files[relative(dist, file).split("\\").join("/")] = [await readFile(file), { mtime }];
}
await mkdir(join(root, "release"), { recursive: true });
const out = join(root, "release", `rankreactor-seo-checker-${pkg.version}.zip`);
await writeFile(out, zipSync(files, { level: 9 }));
console.log(`Wrote ${relative(root, out)} (${Object.keys(files).length} files)`);
