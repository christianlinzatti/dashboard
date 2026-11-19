import { logBatchSchema } from "@/lib/live/log-schema";
import { logStore } from "@/lib/server/log-store";
import { readSession } from "@/lib/server/session";
import { json } from "@/lib/server/spotify-route";

export const dynamic = "force-dynamic";

/** Kiosk meldet Fehler und Leistungsproben (nur angemeldet). */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return json({ error: "Nicht angemeldet." }, 401);
  const b = logBatchSchema.safeParse(await req.json().catch(() => null));
  if (!b.success) return json({ error: "Ungültige Anfrage." }, 400);
  // Zeitstempel vom Server: Uhr des Kiosks kann falsch gehen
  const at = Date.now();
  await logStore().append(
    session.uid,
    b.data.entries.map((e) => ({ ...e, at })),
  );
  return json({ ok: true });
}

/** Protokoll lesen (Debug-Panel). */
export async function GET() {
  const session = await readSession();
  if (!session) return json({ error: "Nicht angemeldet." }, 401);
  return json({ entries: await logStore().list(session.uid) });
}

/** Protokoll leeren (Debug-Panel, /debug). */
export async function DELETE() {
  const session = await readSession();
  if (!session) return json({ error: "Nicht angemeldet." }, 401);
  await logStore().clear(session.uid);
  return json({ ok: true });
}
