import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

// Popup build. The injected audit script is built separately (see scripts/build.mjs).
export default defineConfig({
  plugins: [preact()],
  base: "./",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    modulePreload: false,
    target: "chrome110",
    rollupOptions: {
      input: "popup.html",
      output: {
        // Stable, readable file names make store review easier.
        entryFileNames: "assets/popup.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
