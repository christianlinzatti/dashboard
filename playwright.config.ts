import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;

// Referenz-Screenshots liegen versioniert unter playwright/screenshots/<viewport>/<szenario>.png
export default defineConfig({
  testDir: "./playwright/tests",
  snapshotPathTemplate: "playwright/screenshots/{projectName}/{arg}{ext}",
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: "disabled", caret: "hide" },
  },
  use: {
    baseURL,
    trace: "off",
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    colorScheme: "dark",
    launchOptions: {
      // WebGL im Headless-Chromium per Software-Rendering (deterministisch)
      args: [
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--ignore-gpu-blocklist",
        // Fake-Mikrofon (Testton) ohne Berechtigungsdialog
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  },
  projects: [
    { name: "1280x800", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 } },
    { name: "1024x600", use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 600 }, deviceScaleFactor: 1 } },
    { name: "1920x1200", use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 1 } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        // Test-Zugangsdaten: Spotify selbst wird in den Tests nie aufgerufen (Routen werden gemockt)
        env: {
          SPOTIFY_CLIENT_ID: "e2e-client-id",
          SPOTIFY_CLIENT_SECRET: "e2e-client-secret",
          SESSION_SECRET: "e2e-session-secret-mindestens-32-zeichen-lang",
        },
      },
});
