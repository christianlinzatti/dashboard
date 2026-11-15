import { z } from "zod";
import { daysUntil } from "@/lib/concerts/display";
import { home } from "@/lib/concerts/geo";
import { normalizeLine } from "@/lib/lyrics/text";
import type { CommandInput, Snapshot } from "@/lib/song-context/snapshot";
import { isThemeChoice, THEMES } from "@/lib/stage/themes";

/** Nur die Teile der Alexa-Anfrage, die wir brauchen. */
export const alexaRequestSchema = z.object({
  version: z.string(),
  session: z
    .object({ application: z.object({ applicationId: z.string() }) })
    .partial()
    .optional(),
  context: z.object({ System: z.object({ application: z.object({ applicationId: z.string() }) }) }).optional(),
  request: z.object({
    type: z.string(),
    timestamp: z.string(),
    intent: z
      .object({
        name: z.string(),
        slots: z
          .record(
            z.string(),
            z.object({
              value: z.string().optional(),
              resolutions: z
                .object({
                  resolutionsPerAuthority: z.array(
                    z.object({
                      status: z.object({ code: z.string() }),
                      values: z.array(z.object({ value: z.object({ id: z.string() }) })).optional(),
                    }),
                  ),
                })
                .optional(),
            }),
          )
          .optional(),
      })
      .optional(),
  }),
});
export type AlexaRequest = z.infer<typeof alexaRequestSchema>;

export function speak(text: string, endSession = true) {
  return { version: "1.0", response: { outputSpeech: { type: "PlainText", text }, shouldEndSession: endSession } };
}

/** Wert eines Slots: zuerst die aufgelöste ID (Synonyme), sonst der gesprochene Wert. */
function slot(req: AlexaRequest, name: string): string | undefined {
  const s = req.request.intent?.slots?.[name];
  const resolved = s?.resolutions?.resolutionsPerAuthority.find((a) => a.status.code === "ER_SUCCESS_MATCH")?.values?.[0]?.value
    .id;
  return (resolved ?? s?.value)?.toLowerCase();
}

/** Gesprochener Slot-Wert ohne Auflösung (z. B. Künstlername). */
function slotRaw(req: AlexaRequest, name: string): string | undefined {
  return req.request.intent?.slots?.[name]?.value || undefined;
}

export { SNAPSHOT_STALE_MS as STALE_MS } from "@/lib/cache-policy";
import { SNAPSHOT_STALE_MS as STALE_MS } from "@/lib/cache-policy";

export type HandlerDeps = {
  getSnapshot: () => Promise<Snapshot | null>;
  pushCommand: (c: CommandInput) => Promise<unknown>;
  now?: () => number;
};

function artistsText(s: Snapshot) {
  const main = s.artists.filter((a) => a.role === "main").map((a) => a.name);
  const feat = s.artists.filter((a) => a.role === "feature").map((a) => a.name);
  return feat.length ? `${main.join(" und ")} featuring ${feat.join(" und ")}` : main.join(" und ");
}

const WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const MONTHS = [
  "Jänner",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

/** „Samstag, 5. Dezember“ (gesprochen, österreichisch). */
export function spokenDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  return `${WEEKDAYS[dt.getUTCDay()]}, ${d}. ${MONTHS[m! - 1]}`;
}

/** Heutiges Datum in Wien (JJJJ-MM-TT), unabhängig von der Server-Zeitzone. */
export function todayVienna(now: number): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vienna" }).format(now);
}

function inDays(n: number) {
  return n <= 0 ? "heute" : n === 1 ? "morgen" : `in ${n} Tagen`;
}

/** Artist aus dem Slot (unscharf) oder alle Artists des Songs. */
function pickArtists<T extends { name: string }>(list: T[], spoken: string | undefined): T[] {
  if (!spoken) return list;
  const q = normalizeLine(spoken);
  const hit = list.filter((a) => {
    const n = normalizeLine(a.name);
    return n === q || n.includes(q) || q.includes(n);
  });
  return hit.length ? hit : list;
}

function concertAnswer(s: Snapshot, spoken: string | undefined, today: string): string {
  const names = pickArtists(s.artists, spoken).map((a) => normalizeLine(a.name));
  const list = (s.concerts ?? []).filter((c) => names.includes(normalizeLine(c.artistName)) && c.date >= today);
  if (!list.length)
    return `Ich habe keine bevorstehenden Konzerte von ${spoken ? pickArtists(s.artists, spoken)[0]!.name : artistsText(s)} gefunden.`;
  // eingestellter Heimatort/Umkreis (vom Dashboard gemeldet), sonst Server-Standard
  const { name: homeName, radiusKm } = s.concertArea ?? home();
  const near = list
    .filter((c) => c.distanceKm !== undefined && c.distanceKm <= radiusKm)
    .sort((a, b) => a.date.localeCompare(b.date));
  // Ort ohne Artikel („im/in der“ hängt vom unbekannten Geschlecht des Veranstaltungsorts ab)
  const say = (c: (typeof list)[number]) =>
    `${c.artistName} spielt am ${spokenDate(c.date)} in ${c.city}${c.venue ? `, ${c.venue}` : ""}. Das ist ${inDays(daysUntil(c.date, today))}${c.soldOut ? ", leider ausverkauft" : ""}.`;
  if (near.length) {
    const more =
      near.length > 1 ? ` Danach noch ${near.length - 1} weitere${near.length === 2 ? "r Termin" : " Termine"} in der Nähe.` : "";
    return say(near[0]!) + more;
  }
  const next = [...list].sort((a, b) => a.date.localeCompare(b.date))[0]!;
  return `In der Nähe von ${homeName} ist nichts geplant. Der nächste Termin: ${say(next)}`;
}

function playsAnswer(s: Snapshot): string {
  const u = s.user;
  if (!u || (u.trackPlays === undefined && u.trackSaved === undefined && u.lovedOnLastfm === undefined))
    return "Dazu habe ich gerade keine Daten. Ist Last.fm verbunden?";
  const parts: string[] = [];
  if (u.trackPlays !== undefined)
    parts.push(
      u.trackPlays === 0
        ? `${s.title} hörst du laut Last.fm zum ersten Mal.`
        : `${s.title} hast du laut Last.fm ${u.trackPlays === 1 ? "einmal" : `${u.trackPlays} Mal`} gehört.`,
    );
  if (u.trackSaved) parts.push("Der Song ist in deinen Lieblingssongs auf Spotify.");
  if (u.lovedOnLastfm) parts.push("Auf Last.fm hast du ihn mit einem Herz markiert.");
  return parts.join(" ") || `${s.title} ist nicht in deinen Lieblingssongs.`;
}

function likeAnswer(s: Snapshot, spoken: string | undefined): string {
  const artists = s.user?.artists ?? [];
  if (!artists.length) return "Dazu habe ich gerade keine Daten.";
  const picked = pickArtists(artists, spoken);
  return picked
    .map((a) => {
      const plays = a.plays ? ` Laut Last.fm hast du ${a.name} ${a.plays === 1 ? "einmal" : `${a.plays} Mal`} gehört.` : "";
      if (a.following === true) return `Ja, du folgst ${a.name} auf Spotify.${plays}`;
      if (a.following === false)
        return a.plays ? `Du folgst ${a.name} nicht auf Spotify.${plays}` : `Nein, du folgst ${a.name} noch nicht.`;
      return plays.trim() || `Zu ${a.name} habe ich keine Daten.`;
    })
    .join(" ");
}

function aboutAnswer(s: Snapshot, spoken: string | undefined): string {
  const about = s.about ?? [];
  if (!about.length) return `Über ${artistsText(s)} habe ich gerade keine Infos.`;
  const a = pickArtists(about, spoken)[0]!;
  const facts = a.facts.length ? ` ${a.facts.join(". ")}.` : "";
  return `${a.summary ?? a.name}${facts}`;
}

/** Trivia-Zeilen für die Sprachausgabe: Abkürzungen ausschreiben, als Sätze. */
function spokenTrivia(lines: string[]): string {
  return lines
    .map((t) => t.replace(/\bu\. a\./g, "und andere").replace(/\s+$/, ""))
    .map((t) => (/[.!?]$/.test(t) ? t : `${t}.`))
    .join(" ");
}

const SAMPLE_LINE = /^(Sampelt|Zitiert|Coverversion|Wurde in)/;

function triviaAnswer(s: Snapshot, onlySamples: boolean): string {
  const all = s.trivia ?? [];
  const lines = onlySamples ? all.filter((t) => SAMPLE_LINE.test(t)) : all.slice(0, 3);
  if (!lines.length)
    return onlySamples
      ? `Zu ${s.title} kenne ich kein Sample und keine Coverversion.`
      : `Zu ${s.title} habe ich keine Hintergründe gefunden.`;
  return `Zu ${s.title}: ${spokenTrivia(lines)}`;
}

const onOff = (v: string | undefined) => (v === "an" ? true : v === "aus" ? false : undefined);

/** Beantwortet eine (bereits geprüfte) Alexa-Anfrage. Sprache: Deutsch. */
export async function handleAlexa(req: AlexaRequest, deps: HandlerDeps) {
  const now = deps.now?.() ?? Date.now();
  const type = req.request.type;
  if (type === "LaunchRequest") return speak("Sonic Stage ist bereit. Frag mich zum Beispiel, welcher Song gerade läuft.", false);
  if (type === "SessionEndedRequest") return { version: "1.0", response: {} };
  if (type !== "IntentRequest") return speak("Das habe ich nicht verstanden.");

  const intent = req.request.intent?.name;
  const live = async () => {
    const s = await deps.getSnapshot();
    return s && now - s.updatedAt < STALE_MS ? s : null;
  };

  switch (intent) {
    case "WelcherSongIntent": {
      const s = await live();
      if (!s) return speak("Das Dashboard ist gerade nicht aktiv.");
      if (!s.isPlaying) return speak(`Pausiert: ${s.title} von ${artistsText(s)}.`);
      return speak(`Gerade läuft ${s.title} von ${artistsText(s)}.`);
    }
    case "WerSingtIntent": {
      const s = await live();
      if (!s) return speak("Das Dashboard ist gerade nicht aktiv.");
      if (s.activeSinger) return speak(`Gerade singt ${s.activeSinger}.`);
      return speak(`Das ist ${s.title} von ${artistsText(s)}.`);
    }
    case "LampenIntent": {
      const on = onOff(slot(req, "zustand"));
      if (on === undefined) return speak("Soll ich die Lampen an- oder ausschalten?", false);
      await deps.pushCommand({ type: "lampen", on });
      return speak(on ? "Die Lampen tanzen wieder mit." : "Die Lampen sind aus.");
    }
    case "StroboIntent": {
      const on = onOff(slot(req, "zustand"));
      if (on === undefined) return speak("Soll ich das Stroboskop an- oder ausschalten?", false);
      await deps.pushCommand({ type: "strobo", on });
      return speak(on ? "Stroboskop an." : "Stroboskop aus.");
    }
    case "QualitaetIntent": {
      const v = slot(req, "stufe");
      const value = v === "automatisch" ? "auto" : v;
      if (value !== "auto" && value !== "niedrig" && value !== "mittel" && value !== "hoch") {
        return speak("Welche Qualität? Niedrig, mittel, hoch oder automatisch.", false);
      }
      await deps.pushCommand({ type: "qualitaet", value });
      return speak(`Bühnenqualität ${v}.`);
    }
    case "BuehneIntent": {
      const v = slot(req, "buehne");
      const value = v === "automatisch" ? "auto" : v;
      if (!isThemeChoice(value)) return speak("Welche Bühne? Club, Festival, Synthwave, Jazz oder Weltraum.", false);
      await deps.pushCommand({ type: "buehne", value });
      return speak(value === "auto" ? "Die Bühne passt sich wieder dem Song an." : `Bühne ${THEMES[value].label}.`);
    }
    case "MerkenIntent":
    case "NichtMerkenIntent": {
      const s = await live();
      if (!s) return speak("Das Dashboard ist gerade nicht aktiv.");
      const on = intent === "MerkenIntent";
      if (s.user?.trackSaved === on)
        return speak(on ? `${s.title} ist schon in deinen Lieblingssongs.` : `${s.title} ist nicht in deinen Lieblingssongs.`);
      await deps.pushCommand({ type: "merken", on, trackKey: s.trackKey });
      return speak(
        on ? `Ich speichere ${s.title} in deinen Lieblingssongs.` : `Ich entferne ${s.title} aus deinen Lieblingssongs.`,
      );
    }
    case "ErscheinungsjahrIntent": {
      const s = await live();
      if (!s) return speak("Das Dashboard ist gerade nicht aktiv.");
      const album = s.album ? `, auf dem Album ${s.album}` : "";
      return speak(
        s.releaseYear
          ? `${s.title} ist ${s.releaseYear} erschienen${album}.`
          : `Das Erscheinungsjahr von ${s.title} kenne ich nicht.`,
      );
    }
    case "KonzertIntent": {
      const s = await live();
      if (!s) return speak("Das Dashboard ist gerade nicht aktiv.");
      return speak(concertAnswer(s, slotRaw(req, "kuenstler"), todayVienna(now)));
    }
    case "GehoertIntent": {
      const s = await live();
      if (!s) return speak("Das Dashboard ist gerade nicht aktiv.");
      return speak(playsAnswer(s));
    }
    case "MagIchIntent": {
      const s = await live();
      if (!s) return speak("Das Dashboard ist gerade nicht aktiv.");
      return speak(likeAnswer(s, slotRaw(req, "kuenstler")));
    }
    case "SongTriviaIntent":
    case "SampleIntent": {
      const s = await live();
      if (!s) return speak("Das Dashboard ist gerade nicht aktiv.");
      return speak(triviaAnswer(s, intent === "SampleIntent"));
    }
    case "BandInfoIntent": {
      const s = await live();
      if (!s) return speak("Das Dashboard ist gerade nicht aktiv.");
      return speak(aboutAnswer(s, slotRaw(req, "kuenstler")));
    }
    case "AMAZON.HelpIntent":
      return speak(
        "Du kannst fragen: Welcher Song läuft? Wer singt gerade? Wann ist der Song erschienen? Wann spielen die in der Nähe? Wie oft habe ich das gehört? Mag ich den Künstler? Erzähl mir was über die Band. Merk dir den Song. Oder sagen: Lampen aus, Stroboskop an, Bühne Weltraum.",
        false,
      );
    case "AMAZON.StopIntent":
    case "AMAZON.CancelIntent":
      return speak("Tschüss!");
    default:
      return speak("Das kann ich noch nicht. Sag Hilfe für Beispiele.");
  }
}

export function applicationIdOf(req: AlexaRequest) {
  return req.context?.System.application.applicationId ?? req.session?.application?.applicationId;
}
