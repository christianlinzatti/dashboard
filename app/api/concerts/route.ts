import type { NextRequest } from "next/server";
import { z } from "zod";
import { concertsFor, type ConcertOptions } from "@/lib/concerts/service";
import { BRIDGE_SHOPS, bridgeList } from "@/lib/concerts/shared/protocol";
import { effectiveArea, prefsStore } from "@/lib/server/prefs-store";
import { readSession } from "@/lib/server/session";
import { json } from "@/lib/server/spotify-route";

export const dynamic = "force-dynamic";
const SEP = "\u001f";
const query = z.object({
  ids: z.string().min(1).max(1000),
  names: z.string().min(1).max(1500),
  /** diese Quellen fragt die Pi-Bridge (Ergebnis folgt per POST) – der Server lässt sie aus */
  ohne: z
    .string()
    .max(100)
    .optional()
    .transform((v) => (v ?? "").split(",").filter((x): x is (typeof BRIDGE_SHOPS)[number] => BRIDGE_SHOPS.includes(x as never))),
});
/** POST: wie GET, dazu die Ergebnisse der Pi-Bridge */
const body = z.object({
  ids: z.array(z.string().max(100)).min(1).max(5),
  names: z.array(z.string().max(200)).min(1).max(5),
  bridge: z.array(bridgeList).max(20),
});
const MAX_BODY = 512 * 1024;

async function answer(uid: string, ids: string[], names: string[], opts: ConcertOptions) {
  // eigener Heimatort/Umkreis (geräteübergreifend gespeichert), sonst Standard
  const area = effectiveArea(await prefsStore().get(uid));
  return json(
    await concertsFor(
      ids.map((id, i) => ({ id, name: names[i] ?? "" })),
      undefined,
      area,
      opts,
    ),
  );
}

/** Bevorstehende Konzerte der Artists (Umkreis Heimatort zuerst) und letzte Setlist. */
export async function GET(req: NextRequest) {
  const session = await readSession();
  if (!session) return json({ error: "Nicht angemeldet." }, 401);
  const q = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return json({ error: "Ungültige Anfrage." }, 400);
  return answer(session.uid, q.data.ids.split(SEP), q.data.names.split(SEP), { skip: q.data.ohne });
}

/** Wie GET, mit den Terminen von oeticket/eventim.de, die die Pi-Bridge vom Heimanschluss aus abgefragt hat. */
export async function POST(req: NextRequest) {
  const session = await readSession();
  if (!session) return json({ error: "Nicht angemeldet." }, 401);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return json({ error: "Zu groß." }, 413);
  const text = await req.text().catch(() => "");
  if (text.length > MAX_BODY) return json({ error: "Zu groß." }, 413);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  const b = body.safeParse(parsed);
  if (!b.success) return json({ error: "Ungültige Anfrage." }, 400);
  return answer(session.uid, b.data.ids, b.data.names, { bridge: b.data.bridge });
}
