import type { NextRequest } from "next/server";
import { z } from "zod";
import { concertsFor } from "@/lib/concerts/service";
import { effectiveArea, prefsStore } from "@/lib/server/prefs-store";
import { readSession } from "@/lib/server/session";
import { json } from "@/lib/server/spotify-route";

export const dynamic = "force-dynamic";
const SEP = "\u001f";
const query = z.object({ ids: z.string().min(1).max(1000), names: z.string().min(1).max(1500) });

/** Bevorstehende Konzerte der Artists (Umkreis Heimatort zuerst) und letzte Setlist. */
export async function GET(req: NextRequest) {
  const session = await readSession();
  if (!session) return json({ error: "Nicht angemeldet." }, 401);
  const q = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return json({ error: "Ungültige Anfrage." }, 400);
  const ids = q.data.ids.split(SEP);
  const names = q.data.names.split(SEP);
  // eigener Heimatort/Umkreis (geräteübergreifend gespeichert), sonst Standard
  const area = effectiveArea(await prefsStore().get(session.uid));
  return json(
    await concertsFor(
      ids.map((id, i) => ({ id, name: names[i] ?? "" })),
      undefined,
      area,
    ),
  );
}
