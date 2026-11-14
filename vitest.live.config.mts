import { defineConfig } from "vitest/config";
import path from "node:path";

// Prüft echte Lyrics-Provider (Netzwerk!) – läuft täglich in .github/workflows/provider-check.yml
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: { include: ["tests/live/**/*.test.ts"], environment: "node", testTimeout: 20_000 },
});
