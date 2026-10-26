import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "chrome116",
    rollupOptions: {
      input: {
        sidepanel: fileURLToPath(new URL("./sidepanel.html", import.meta.url)),
        overlayDemo: fileURLToPath(new URL("./overlay-demo.html", import.meta.url)),
        background: fileURLToPath(new URL("./src/background.ts", import.meta.url)),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  resolve: {
    alias: {
      "@corrector/core": fileURLToPath(
        new URL("../../packages/core/src/index.ts", import.meta.url),
      ),
    },
  },
  server: {
    fs: {
      allow: [root, fileURLToPath(new URL("../..", import.meta.url))],
    },
  },
});
