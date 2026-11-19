/**
 * Bildschirm ein/aus über einen Systembefehl (HDMI): Das Dashboard meldet in der Ruhezeit „aus“, beim Wecken oder
 * wenn Musik startet „an“. Geschaltet wird nur bei Änderung und höchstens alle `minIntervalMs` (Monitore mögen kein
 * schnelles Hin und Her); die letzte Anforderung gewinnt.
 *
 * Sicherheitsnetz: Meldet sich das Dashboard bei ausgeschaltetem Bildschirm länger nicht (abgestürzt, Netz weg), wird
 * der Bildschirm wieder eingeschaltet – sonst bliebe er schwarz, und niemand sähe, dass etwas nicht stimmt.
 */
export type DisplayOptions = {
  /** Befehl zum Ausschalten (z. B. „wlr-randr --output HDMI-A-1 --off“) */
  off: string;
  /** Befehl zum Einschalten */
  on: string;
  run: (command: string) => void;
  minIntervalMs?: number;
  /** so lange ohne Lebenszeichen vom Dashboard → Bildschirm wieder an */
  aliveTimeoutMs?: number;
  now?: () => number;
};

export function createDisplay(opts: DisplayOptions) {
  const now = opts.now ?? Date.now;
  const minInterval = opts.minIntervalMs ?? 10_000;
  const aliveTimeout = opts.aliveTimeoutMs ?? 120_000;
  /** tatsächlicher Zustand (unbekannt bis zum ersten Schalten – dann wird auf jeden Fall geschaltet) */
  let current: boolean | null = null;
  let wanted = true;
  let lastSwitch = -Infinity;
  let lastAlive = now();
  let lastReason: string | null = null;

  const apply = (reason: string) => {
    const t = now();
    if (wanted === current || t - lastSwitch < minInterval) return;
    current = wanted;
    lastSwitch = t;
    lastReason = reason;
    opts.run(wanted ? opts.on : opts.off);
  };

  return {
    /** Wunsch des Dashboards */
    set(on: boolean) {
      lastAlive = now();
      wanted = on;
      apply(on ? "Dashboard: an" : "Dashboard: Ruhezeit");
    },
    /** jedes Lebenszeichen des Dashboards */
    alive() {
      lastAlive = now();
    },
    /** regelmäßig aufrufen: verschobenes Schalten nachholen, Sicherheitsnetz */
    check() {
      if (!wanted && now() - lastAlive > aliveTimeout) {
        wanted = true;
        apply("kein Lebenszeichen – Bildschirm wieder an");
        return;
      }
      apply(lastReason ?? "nachgeholt");
    },
    /** sofort einschalten (Start der Bridge, Neustart des Kiosks) */
    forceOn(reason: string) {
      wanted = true;
      lastSwitch = -Infinity;
      current = null;
      apply(reason);
    },
    status: () => ({
      on: current,
      wanted,
      lastSwitch: Number.isFinite(lastSwitch) ? new Date(lastSwitch).toISOString() : null,
      lastReason,
    }),
  };
}
export type Display = ReturnType<typeof createDisplay>;
