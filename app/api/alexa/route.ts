import { alexaRequestSchema, applicationIdOf, handleAlexa } from "@/lib/alexa/handler";
import { AlexaVerificationError, defaultFetchCertChain, verifyAlexaRequest } from "@/lib/alexa/verify";
import { liveStore } from "@/lib/server/live-store";
import { serverEnv } from "@/lib/server/env";

export const dynamic = "force-dynamic";

/**
 * Endpunkt des Alexa-Skills „Sonic Stage“. Jede Anfrage wird nach Amazons Vorgaben geprüft.
 * Ein Dashboard = ein Nutzer: Alexa spricht mit dem Stand von ALEXA_SPOTIFY_USER
 * (Standard: erster Eintrag in ALLOWED_SPOTIFY_USERS).
 */
export async function POST(req: Request) {
  const skillId = process.env.ALEXA_SKILL_ID;
  const uid = process.env.ALEXA_SPOTIFY_USER ?? serverEnv().allowedUsers[0];
  if (!skillId || !uid) return Response.json({ error: "Alexa ist nicht konfiguriert." }, { status: 503 });

  const raw = await req.text();
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    /* unten als ungültig behandelt */
  }
  const parsed = alexaRequestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });

  try {
    await verifyAlexaRequest(
      { certUrl: req.headers.get("signaturecertchainurl"), signature256: req.headers.get("signature-256") },
      raw,
      parsed.data.request.timestamp,
      { fetchCertChain: defaultFetchCertChain },
    );
  } catch (e) {
    if (e instanceof AlexaVerificationError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
  if (applicationIdOf(parsed.data) !== skillId) return Response.json({ error: "Falscher Skill." }, { status: 400 });

  const store = liveStore();
  return Response.json(
    await handleAlexa(parsed.data, {
      getSnapshot: () => store.getSnapshot(uid),
      pushCommand: (c) => store.pushCommand(uid, c),
    }),
  );
}
