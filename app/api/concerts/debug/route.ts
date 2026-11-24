import type { NextRequest } from "next/server";
import { z } from "zod";
import { classifyRaw } from "@/lib/concerts/debug";
import { concertsFor, missingConcertSources } from "@/lib/concerts/service";
import { effectiveArea, prefsStore } from "@/lib/server/prefs-store";
import { readSession } from "@/lib/server/session";
import { json } from "@/lib/server/spotify-route";

export const dynamic = "force-dynamic";
const query = z.object({
  names: z.string().trim().min(1).max(300),
  fresh: z.enum(["0", "1"]).optional(),
});

/** frische Abfragen höchstens alle 15 s je Konto – die Quellen sollen nicht im Sekundentakt gefragt werden */
const FRESH_EVERY_MS = 15_000;
const lastFresh = new Map<string, number>();

/**
 * Konzerttermine für /debug: je Künstler und Quelle Status, Dauer und Fehler, alle Rohtermine mit dem, was daraus
 * wurde (gezeigt, vergangen, abgesagt, nicht unter den ersten 5), und das Ergebnis wie auf der Konzertkarte.
 * Künstler durch Komma getrennt (höchstens 5); `fresh=1` fragt die Quellen ohne Cache neu.
 */
export async function GET(req: NextRequest) {
  const session = await readSession();
  if (!session) return json({ error: "Nicht angemeldet." }, 401);
  const q = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return json({ error: "Ungültige Anfrage." }, 400);
  const names = [
    ...new Set(
      q.data.names
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean),
    ),
  ].slice(0, 5);
  if (!names.length) return json({ error: "Ungültige Anfrage." }, 400);
  let fresh = q.data.fresh === "1";
  if (fresh) {
    const now = Date.now();
    if (now - (lastFresh.get(session.uid) ?? 0) < FRESH_EVERY_MS)
      fresh = false; // zu schnell: aus dem Cache
    else lastFresh.set(session.uid, now);
  }
  const area = effectiveArea(await prefsStore().get(session.uid));
  const today = new Date().toISOString().slice(0, 10);
  const result = await concertsFor(
    names.map((name) => ({ id: name, name })),
    req.signal,
    area,
    { raw: true, fresh },
  );
  const raw = names.map((artist) => ({
    artist,
    rows: classifyRaw(
      artist,
      (result.raw ?? []).filter((r) => r.artist === artist),
      result.concerts,
      today,
    ),
  }));
  return json({
    today,
    fresh,
    area: result.area,
    providers: result.providers,
    missing: missingConcertSources(),
    sources: result.sources,
    concerts: result.concerts,
    raw,
    setlists: result.setlists,
  });
}
