/** Zeitpunkt des zuletzt gezeichneten Bildes (für das Lebenszeichen an den Watchdog). */
let lastFrame = typeof performance === "undefined" ? 0 : performance.now();

export function markFrame(t = performance.now()) {
  lastFrame = t;
}

export function frameAgeMs(now = performance.now()) {
  return Math.max(0, Math.round(now - lastFrame));
}
