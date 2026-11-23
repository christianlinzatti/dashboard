import "server-only";
import { createCanvas } from "./canvas";

let shared: ReturnType<typeof createCanvas> | undefined;

function instance() {
  shared ??= createCanvas({
    spDc: process.env.SPOTIFY_SP_DC,
    totpSecret: process.env.SPOTIFY_TOTP_SECRET,
    totpVersion: process.env.SPOTIFY_TOTP_VERSION,
    onCircuitOpen: (reason, ms) => console.warn(`[canvas] spotify-canvas pausiert ${Math.round(ms / 60_000)} min: ${reason}`),
  });
  return shared;
}

/** Canvas (Loop-Video/Bild) eines Tracks, oder null. Nutzt das Web-Player-Token (sp_dc + TOTP). */
export function canvasFor(trackId: string, signal: AbortSignal) {
  return instance().get(trackId, signal);
}

/** Betriebszustand des Canvas-Abrufs (für /debug). */
export function canvasStatus() {
  return instance().status();
}
