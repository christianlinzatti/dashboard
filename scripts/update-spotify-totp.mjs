import { chromium } from "@playwright/test";

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    });

    let capturedSecret = null;

    // 1. Key-Log aus Page UND Web Workern über console-Events abfangen
    const handleConsole = (msg) => {
      const text = msg.text();
      if (text.startsWith("__TOTP_KEY__:")) {
        capturedSecret = text.slice("__TOTP_KEY__:".length);
      }
    };

    // 2. Init-Script läuft sowohl im Main-Thread als auch in Web Workern (globalThis)
    await context.addInitScript(() => {
      if (!globalThis.crypto?.subtle?.importKey) return;
      const origImportKey = globalThis.crypto.subtle.importKey.bind(globalThis.crypto.subtle);
      globalThis.crypto.subtle.importKey = async (format, keyData, algorithm, extractable, keyUsages) => {
        if (format === "raw" && (algorithm === "HMAC" || algorithm?.name === "HMAC")) {
          const decoded = new TextDecoder().decode(new Uint8Array(keyData));
          if (/^\d+$/.test(decoded)) {
            console.log("__TOTP_KEY__:" + decoded);
          }
        }
        return origImportKey(format, keyData, algorithm, extractable, keyUsages);
      };
    });

    const page = await context.newPage();
    page.on("console", handleConsole);
    page.on("worker", (worker) => worker.on("console", handleConsole));

    const tokenRequestPromise = page.waitForRequest(
      (req) => (req.url().includes("/api/token") || req.url().includes("/get_access_token")) && req.url().includes("totpVer="),
      { timeout: 30_000 },
    );

    await page.goto("https://open.spotify.com/", { waitUntil: "domcontentloaded" });

    const req = await tokenRequestPromise;
    const url = new URL(req.url());
    const version = url.searchParams.get("totpVer");

    // Kurz warten, falls das console-Event aus dem Worker minimal verzögert ankommt
    if (!capturedSecret) {
      await page.waitForTimeout(300);
    }

    if (!capturedSecret || !version) {
      throw new Error(`Extraktion unvollständig (version=${version ?? "null"}, secretFound=${Boolean(capturedSecret)})`);
    }

    process.stdout.write(JSON.stringify({ secret: capturedSecret, version }));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
