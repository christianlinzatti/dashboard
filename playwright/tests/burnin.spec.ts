import { expect, test } from "@playwright/test";

test("Startbildschirm dunkelt nach 10 und 60 Minuten ab, Antippen weckt", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  const idle = page.getByTestId("idle");
  await expect(idle).toHaveAttribute("data-dim", "1");
  await page.clock.fastForward("10:30");
  await expect(idle).toHaveAttribute("data-dim", "0.35");
  await page.clock.fastForward("55:00");
  await expect(idle).toHaveAttribute("data-dim", "0.12");
  await idle.dispatchEvent("pointerdown");
  await expect(idle).toHaveAttribute("data-dim", "1");
});

test("Burn-in-Drift läuft live, in eingefrorenen Demos nicht", async ({ page }) => {
  await page.goto("/?demo=neonlicht&t=46000");
  const header = page.getByTestId("now-playing");
  await expect(header).toBeVisible();
  expect(await header.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  await page.goto("/?demo=neonlicht"); // läuft (nicht eingefroren)
  await expect(header).toBeVisible();
  expect(await header.evaluate((el) => getComputedStyle(el).animationName)).toBe("burnin-drift");
});
