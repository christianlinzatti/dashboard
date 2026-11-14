/**
 * Abgleich der lokal interpolierten Songzeit mit einem neuen Spotify-Stand.
 * Kleine Abweichungen werden sanft korrigiert (kein sichtbares Springen der Lyrics),
 * große (Spulen, Songwechsel, Pause) sofort übernommen.
 */
export function reconcilePosition(predictedMs: number, measuredMs: number, opts = { hardJumpMs: 1500, gain: 0.35 }) {
  const diff = measuredMs - predictedMs;
  if (Math.abs(diff) >= opts.hardJumpMs) return measuredMs;
  if (Math.abs(diff) < 40) return predictedMs; // Rauschen ignorieren
  return predictedMs + diff * opts.gain;
}

/** Gemessene Position: Spotify-Wert + halbe Round-Trip-Zeit (Netzwerklatenz). */
export function measuredPosition(progressMs: number, rttMs: number) {
  return progressMs + Math.max(0, rttMs) / 2;
}

/** Abfrageintervall: häufiger kurz vor Songende, damit der Wechsel schnell erkannt wird. */
export function pollDelay(state: { isPlaying: boolean; remainingMs: number }) {
  if (!state.isPlaying) return 4000;
  if (state.remainingMs < 6000) return 1000;
  return 3000;
}
