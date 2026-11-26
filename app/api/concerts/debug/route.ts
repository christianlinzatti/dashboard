import type { NextRequest } from "next/server";
import { z } from "zod";
import { classifyRaw } from "@/lib/concerts/debug";
import { concertsFor, missingConcertSources } from "@/lib/concerts/service";
import { bridgeList, type BridgeList } from "@/lib/concerts/shared/protocol";
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
  return check(req, session.uid, q.data);
}

/** Wie GET, dazu die Ergebnisse der Pi-Bridge (oeticket, eventim.de vom Heimanschluss) */
const body = query.extend({ fresh: z.boolean().optional(), bridge: z.array(bridgeList).max(20) });
export async function POST(req: NextRequest) {
  const session = await readSession();
  if (!session) return json({ error: "Nicht angemeldet." }, 401);
  const b = body.safeParse(await req.json().catch(() => null));
  if (!b.success) return json({ error: "Ungültige Anfrage." }, 400);
  return check(req, session.uid, { names: b.data.names, fresh: b.data.fresh ? "1" : "0" }, b.data.bridge);
}

async function check(req: NextRequest, uid: string, q: { names: string; fresh?: "0" | "1" }, bridge?: BridgeList[]) {
  const names = [
    ...new Set(
      q.names
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean),
    ),
  ].slice(0, 5);
  if (!names.length) return json({ error: "Ungültige Anfrage." }, 400);
  let fresh = q.fresh === "1";
  if (fresh) {
    const now = Date.now();
    if (now - (lastFresh.get(uid) ?? 0) < FRESH_EVERY_MS)
      fresh = false; // zu schnell: aus dem Cache
    else lastFresh.set(uid, now);
  }
  const area = effectiveArea(await prefsStore().get(uid));
  const today = new Date().toISOString().slice(0, 10);
  const result = await concertsFor(
    names.map((name) => ({ id: name, name })),
    req.signal,
    area,
    { raw: true, fresh, ...(bridge ? { bridge } : {}) },
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
