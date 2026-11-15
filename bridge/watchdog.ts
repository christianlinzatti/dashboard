/**
 * Watchdog: Das Dashboard schickt alle 10 s ein Lebenszeichen (mit Alter des letzten gezeichneten Bildes).
 * Bleibt es aus oder hängt die Grafik, wird `onStall` ausgelöst (z. B. Chromium neu starten) –
 * höchstens alle `cooldownMs`. Scharf erst nach dem ersten Lebenszeichen (Start/Neustart braucht Zeit).
 */
export type WatchdogOptions = {
  timeoutMs?: number;
  frameStallMs?: number;
  cooldownMs?: number;
  onStall: (reason: string) => void;
  now?: () => number;
};

export function createWatchdog(opts: WatchdogOptions) {
  const now = opts.now ?? Date.now;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const frameStallMs = opts.frameStallMs ?? 30_000;
  const cooldownMs = opts.cooldownMs ?? 5 * 60_000;
  let last: number | null = null;
  let frameAge = 0;
  let visible = true;
  let lastAction = -Infinity;
  let lastReason: string | null = null;

  return {
    beat(frameAgeMs = 0, isVisible = true) {
      last = now();
      frameAge = frameAgeMs;
      visible = isVisible;
    },
    /** regelmäßig aufrufen; gibt den Grund zurück, falls eingegriffen wurde */
    check(): string | null {
      if (last === null) return null;
      const t = now();
      const reason =
        t - last > timeoutMs ? "kein Lebenszeichen vom Dashboard" : visible && frameAge > frameStallMs ? "Grafik hängt" : null;
      if (!reason || t - lastAction < cooldownMs) return null;
      lastAction = t;
      lastReason = reason;
      last = null; // erst nach dem nächsten Lebenszeichen wieder scharf
      opts.onStall(reason);
      return reason;
    },
    status: () => ({
      armed: last !== null,
      lastBeatAgoMs: last === null ? null : now() - last,
      frameAgeMs: frameAge,
      lastAction: Number.isFinite(lastAction) ? new Date(lastAction).toISOString() : null,
      lastReason,
    }),
  };
}
export type Watchdog = ReturnType<typeof createWatchdog>;
