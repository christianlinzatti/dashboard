import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["lib/**"],
      // nur im Browser lauffähig (Web Audio) bzw. reine Testdaten
      exclude: ["lib/audio/mic.ts", "lib/song-context/fixtures/**"],
      reporter: ["text-summary", "json-summary", "html"],
      // CI schlägt fehl, wenn die Abdeckung der Fachlogik sinkt
      thresholds: { statements: 88, branches: 78, functions: 85, lines: 90 },
    },
  },
});
