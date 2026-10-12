import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: import.meta.dirname,
  publicDir: "../public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: {
      input: ["index.html", "offline.html"].map((page) => resolve(import.meta.dirname, page)),
    },
  },
});
