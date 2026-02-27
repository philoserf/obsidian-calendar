import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [svelte({ emitCss: false, compilerOptions: { runes: true } })],
  resolve: {
    alias: {
      src: path.resolve(__dirname, "src"),
    },
  },
  build: {
    lib: {
      entry: "src/main.ts",
      formats: ["cjs"],
      fileName: () => "main.js",
    },
    sourcemap: mode === "development" ? "inline" : false,
    rollupOptions: {
      external: ["obsidian", "fs", "os", "path"],
      output: {
        exports: "default",
      },
    },
  },
}));
