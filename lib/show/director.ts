import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { THEMES, themeIds } from "@/lib/stage/themes";
import { sanitizeBrief, showBriefSchema, type ShowBrief } from "./brief";

/** Was die KI-Regie über den Song erfährt */
export type SongFacts = {
  title: string;
  artists: string[];
  album?: string;
  year?: number;
  durationMs: number;
  tags: string[];
  /** Abschnitte in Songreihenfolge */
  sections: Array<{ kind: string; seconds: number }>;
  /** Textauszug (kann fehlen) */
  lyrics?: string;
};

export const DEFAULT_SHOW_MODEL = "claude-opus-5-5";

const STAGE_NOTES: Record<(typeof themeIds)[number], string> = {
  club: "dunkler Club mit LED-Wand, Lasern und Spiegelboden – Elektronisches, Hip-Hop, alles Nächtliche",
  festival: "Open Air im Abendrot, große Bühne, großes Publikum – Rock, Pop, Hymnen, Mitsing-Songs",
  synthwave: "Retro-Sonne, Neonraster, Berge – Synthpop, 80er-Ästhetik, verträumt-treibend",
  jazz: "kleiner Keller mit rotem Vorhang, Holzboden, Spiegelkugel, wenig Publikum – Jazz, Soul, Akustik, Chanson, Leises",
  weltraum: "Sternenhimmel, Ringplanet, Mondboden – sphärisch, episch, Balladen mit Weite, Ambient",
};

export const SHOW_SYSTEM_PROMPT = `Du bist die Show-Regie von „Sonic Stage“. Das ist ein Lyric-Dashboard: Zu dem Song, der gerade läuft, tanzen 3D-Avatare auf einer virtuellen Konzertbühne – mit Lichtshow, Spezialeffekten, Publikum und den Lyrics als große Schrift im Bild.

Du schreibst die Regieanweisung für genau einen Song. Sie soll zu diesem Song passen (Klang, Stimmung, Inhalt, Epoche) und ihm eine eigene Handschrift geben, damit nicht jede Show gleich aussieht. Die Technik setzt deine Anweisung taktgenau um; du entscheidest nur die Richtung.

Bühnen (stage) und welche Effekte sie haben:
${themeIds.map((id) => `- ${id}: ${STAGE_NOTES[id]}. Effekte: ${THEMES[id].effects.join(", ")}`).join("\n")}

Abschnitte (sections): genau ein Eintrag für jede Abschnittsart, die im Song vorkommt.
- energy: ruhig, mittel, hoch oder hoehepunkt – wie wild Tanz, Licht und Kamera werden. Eine Show lebt vom Kontrast: Wenn alles hoehepunkt ist, ist nichts mehr einer. Ruhige Songs dürfen ganz ohne hoehepunkt bleiben.
- lyrics: Schrift-Effekt – gluehen (ruhig), neon (Leuchtröhre), feuer (Flammen an der Schrift), welle (Wörter wippen), echo (versetzte Schatten), glitch (digitales Flackern)
- crowd: was das Publikum tut – handys (Lichtermeer), wiegen, haende (Hände oben), springen
- moment: wie die Tänzer zusammen tanzen – synchron (alle denselben Tanz, wirkt wie eine einstudierte Crew; typisch für den Refrain), kanon (derselbe Tanz als Welle von links nach rechts), solo (der Lead tanzt allein im Spot, die Crew hält still – stark für Bridge oder eine leise Strophe), frei (jeder tanzt anders, locker). Wechsle zwischen den Abschnitten, damit die Show Momente bekommt.
- effects: was beim Einsatz des Abschnitts zündet, nur Effekte der gewählten Bühne. pyro = Funkenfontänen, flammen = Flammenwerfer, co2 = Nebelstöße, funken = kalte Funken, ringe = Lichtringe am Boden, sternschnuppen, glitzer = Spiegelkugel, konfetti und feuerwerk am besten nur im großen Finale. Eine leere Liste ist erlaubt und oft richtig.

Außerdem: mood (Grundstimmung des Songs), genres (zwei bis vier englische Genre-Begriffe in Kleinbuchstaben, z. B. "indie rock"), motto (ein Satz auf Deutsch zur Idee dieser Show).

Kennst du den Song, nutze dein Wissen über ihn. Kennst du ihn nicht, leite alles aus Titel, Tags, Aufbau und Text ab.`;

function describe(f: SongFacts): string {
  const lines = [
    `Titel: ${f.title}`,
    `Künstler: ${f.artists.join(", ")}`,
    f.album ? `Album: ${f.album}${f.year ? ` (${f.year})` : ""}` : f.year ? `Jahr: ${f.year}` : "",
    `Dauer: ${Math.round(f.durationMs / 1000)} s`,
    f.tags.length ? `Tags aus Musikdatenbanken: ${f.tags.join(", ")}` : "",
    f.sections.length
      ? `Aufbau: ${f.sections.map((s) => `${s.kind} (${s.seconds} s)`).join(" → ")}`
      : "Aufbau: unbekannt – gib Anweisungen für intro, verse, chorus, bridge, instrumental und outro.",
    f.lyrics ? `Textauszug:\n${f.lyrics}` : "Text: nicht verfügbar (vielleicht instrumental).",
  ];
  return lines.filter(Boolean).join("\n");
}

export type DirectorResult = { brief: ShowBrief | null; reason?: "abgelehnt" | "ungültig" | "konfiguration" | "vorübergehend" };

/**
 * KI-Regie: ein Aufruf je Song (Ergebnis wird gecacht). Strukturierte Ausgabe nach dem Brief-Schema,
 * niedriger Aufwand (die Aufgabe ist klein), serverseitiger Ausweich-Fallback bei Ablehnung.
 */
export function createShowDirector(deps: { client: Anthropic; model?: string }) {
  const model = deps.model || DEFAULT_SHOW_MODEL;
  return async function direct(facts: SongFacts): Promise<DirectorResult> {
    try {
      const res = await deps.client.beta.messages.parse({
        model,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SHOW_SYSTEM_PROMPT,
        messages: [{ role: "user", content: describe(facts) }],
        output_config: { effort: "low", format: betaZodOutputFormat(showBriefSchema) },
      });
      if (res.stop_reason === "refusal") return { brief: null, reason: "abgelehnt" };
      const brief = sanitizeBrief(res.parsed_output);
      return brief ? { brief } : { brief: null, reason: "ungültig" };
    } catch (e) {
      if (
        e instanceof Anthropic.AuthenticationError ||
        e instanceof Anthropic.PermissionDeniedError ||
        e instanceof Anthropic.BadRequestError
      )
        return { brief: null, reason: "konfiguration" };
      if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.APIConnectionError || e instanceof Anthropic.APIError)
        return { brief: null, reason: "vorübergehend" };
      throw e;
    }
  };
}

export { describe as describeSong };
