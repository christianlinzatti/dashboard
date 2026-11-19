import { liveStore } from "@/lib/server/live-store";
import { readSession } from "@/lib/server/session";
import { json } from "@/lib/server/spotify-route";

export const dynamic = "force-dynamic";

/** Kiosk holt offene Befehle ab (schnell, solange eine Fernbedienung offen ist; ohne Song regelmäßig). */
export async function GET() {
  const session = await readSession();
  if (!session) return json({ error: "Nicht angemeldet." }, 401);
  return json(await liveStore().takeCommands(session.uid));
}
