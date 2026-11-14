import { liveStore } from "@/lib/server/live-store";
import { readSession } from "@/lib/server/session";
import { json } from "@/lib/server/spotify-route";
import { snapshotSchema } from "@/lib/song-context/snapshot";

export const dynamic = "force-dynamic";

/** Dashboard meldet seinen Stand; Antwort enthält offene Befehle (z. B. von Alexa). */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return json({ error: "Nicht angemeldet." }, 401);
  const parsed = snapshotSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Ungültiger Schnappschuss." }, 400);
  const store = liveStore();
  await store.saveSnapshot(session.uid, parsed.data);
  return json({ commands: await store.takeCommands(session.uid) });
}

/** Aktueller Stand (für Diagnose; Alexa liest serverseitig direkt aus dem Store). */
export async function GET() {
  const session = await readSession();
  if (!session) return json({ error: "Nicht angemeldet." }, 401);
  return json({ snapshot: await liveStore().getSnapshot(session.uid) });
}
