import type { NextRequest } from "next/server";
import { z } from "zod";
import { liveStore } from "@/lib/server/live-store";
import { readSession } from "@/lib/server/session";
import { json } from "@/lib/server/spotify-route";
import { commandSchema } from "@/lib/song-context/snapshot";

export const dynamic = "force-dynamic";

/**
 * Fernbedienung: Stand des Bildschirms lesen (`?alive=1` hält den schnellen Befehlsabruf des Kiosks an) …
 */
export async function GET(req: NextRequest) {
  const session = await readSession();
  if (!session) return json({ error: "Nicht angemeldet." }, 401);
  const store = liveStore();
  if (req.nextUrl.searchParams.get("alive") === "1") await store.markRemote(session.uid);
  return json({ snapshot: await store.getSnapshot(session.uid) });
}

const body = z.object({ command: commandSchema });

/** … und Befehle an den Bildschirm schicken (Bühne, Effekte, Lampen, Lyrics, Bildschirm). */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return json({ error: "Nicht angemeldet." }, 401);
  const b = body.safeParse(await req.json().catch(() => null));
  if (!b.success) return json({ error: "Ungültiger Befehl." }, 400);
  await liveStore().pushCommand(session.uid, b.data.command, { remote: true });
  return json({ ok: true });
}
