import { defineConfig } from "vitest/config";
import path from "node:path";

// Prüft echte Lyrics-Provider (Netzwerk!) – läuft täglich in .github/workflows/provider-check.yml
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: { include: ["tests/live/**/*.test.ts"], environment: "node", testTimeout: 20_000 },
});
