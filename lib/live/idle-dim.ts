/** Helligkeit des Startbildschirms im Leerlauf: nach 10 min gedimmt, nach 60 min fast aus (Burn-in, Strom). */
export function idleBrightness(idleMs: number): number {
  if (idleMs >= 60 * 60_000) return 0.12;
  if (idleMs >= 10 * 60_000) return 0.35;
  return 1;
}
