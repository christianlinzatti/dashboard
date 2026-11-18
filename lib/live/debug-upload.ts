import { z } from "zod";

/**
 * Song-Kontext aus dem Debug-Panel an den Server schicken, um ihn auf einem anderen Gerät anzusehen (/debug).
 * Nur auf Abruf (Knopf) oder im „Live“-Modus des Panels – nie im Normalbetrieb (Upstash-Kontingent).
 */
export const DEBUG_MAX_BYTES = 900_000;

export const debugUploadSchema = z.object({
  /** Zeitpunkt auf dem Kiosk (zur Anzeige; der Server merkt sich zusätzlich seine eigene Zeit) */
  sentAt: z.number(),
  /** Gerätename/Bildschirm, damit man mehrere Dashboards auseinanderhält */
  device: z.string().max(200).optional(),
  context: z.record(z.string(), z.unknown()),
});
export type DebugUpload = z.infer<typeof debugUploadSchema>;
export type DebugEntry = DebugUpload & { receivedAt: number };

/** Rohtext prüfen: Größe begrenzen, JSON und Form validieren */
export function parseDebugUpload(
  text: string,
): { ok: true; data: DebugUpload } | { ok: false; status: 400 | 413; error: string } {
  if (new TextEncoder().encode(text).length > DEBUG_MAX_BYTES) return { ok: false, status: 413, error: "Song-Kontext zu groß." };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, status: 400, error: "Kein gültiges JSON." };
  }
  const p = debugUploadSchema.safeParse(raw);
  return p.success ? { ok: true, data: p.data } : { ok: false, status: 400, error: "Ungültiger Song-Kontext." };
}

/** Vom Kiosk aus senden; liefert eine kurze Meldung fürs Panel */
export async function sendDebugContext(context: Record<string, unknown>, fetcher: typeof fetch = fetch): Promise<string> {
  const body: DebugUpload = {
    sentAt: Date.now(),
    device: typeof window !== "undefined" ? `${window.screen.width}×${window.screen.height}` : undefined,
    context,
  };
  try {
    const res = await fetcher("/api/debug-context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 401) return "Nicht angemeldet – Senden geht nur mit Spotify-Anmeldung";
    if (!res.ok) return `Senden fehlgeschlagen (${res.status})`;
    return "An Server gesendet ✓ – ansehen unter /debug";
  } catch {
    return "Keine Verbindung zum Server";
  }
}
