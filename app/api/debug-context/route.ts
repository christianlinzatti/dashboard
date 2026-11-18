import { parseDebugUpload } from "@/lib/live/debug-upload";
import { debugStore } from "@/lib/server/debug-store";
import { readSession } from "@/lib/server/session";
import { json } from "@/lib/server/spotify-route";

export const dynamic = "force-dynamic";

/** Debug-Panel schickt den kompletten Song-Kontext (nur angemeldet, nur auf Abruf). */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return json({ error: "Nicht angemeldet." }, 401);
  const parsed = parseDebugUpload(await req.text().catch(() => ""));
  if (!parsed.ok) return json({ error: parsed.error }, parsed.status);
  await debugStore().save(session.uid, { ...parsed.data, receivedAt: Date.now() });
  return json({ ok: true });
}

/** Zuletzt gesendeter Song-Kontext – zum Ansehen auf einem anderen Gerät (/debug). */
export async function GET() {
  const session = await readSession();
  if (!session) return json({ error: "Nicht angemeldet." }, 401);
  return json({ entry: (await debugStore().get(session.uid)) ?? null });
}
