import { clearSession } from "@/lib/server/session";
import { json } from "@/lib/server/spotify-route";

export async function POST() {
  await clearSession();
  return json({ ok: true });
}
