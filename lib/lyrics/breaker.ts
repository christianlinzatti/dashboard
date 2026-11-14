/**
 * Circuit-Breaker je Provider: nach mehreren Fehlern in Folge wird der Provider
 * für eine Weile übersprungen (z. B. wenn eine inoffizielle Schnittstelle bricht).
 */
export function createBreaker(opts = { threshold: 5, cooldownMs: 60 * 60_000 }) {
  const state = new Map<string, { fails: number; openUntil: number }>();
  return {
    isOpen(id: string, now = Date.now()) {
      return (state.get(id)?.openUntil ?? 0) > now;
    },
    success(id: string) {
      state.delete(id);
    },
    failure(id: string, now = Date.now()) {
      const s = state.get(id) ?? { fails: 0, openUntil: 0 };
      s.fails++;
      if (s.fails >= opts.threshold) {
        s.openUntil = now + opts.cooldownMs;
        s.fails = 0;
      }
      state.set(id, s);
    },
    snapshot() {
      return Object.fromEntries(state);
    },
  };
}
export type Breaker = ReturnType<typeof createBreaker>;
