/** Gesprochene Antworten des Alexa-Skills aus dem Song-Kontext */
import { daysUntil } from "@/lib/concerts/display";
import { home } from "@/lib/concerts/geo";
import { normalizeLine } from "@/lib/lyrics/text";
import type { Snapshot } from "@/lib/song-context/snapshot";
import type { EffectKind } from "@/lib/stage/themes";

export function artistsText(s: Snapshot) {
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

export function concertAnswer(s: Snapshot, spoken: string | undefined, today: string): string {
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

export function playsAnswer(s: Snapshot): string {
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

export function likeAnswer(s: Snapshot, spoken: string | undefined): string {
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

export function aboutAnswer(s: Snapshot, spoken: string | undefined): string {
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

export function triviaAnswer(s: Snapshot, onlySamples: boolean): string {
  const all = s.trivia ?? [];
  const lines = onlySamples ? all.filter((t) => SAMPLE_LINE.test(t)) : all.slice(0, 3);
  if (!lines.length)
    return onlySamples
      ? `Zu ${s.title} kenne ich kein Sample und keine Coverversion.`
      : `Zu ${s.title} habe ich keine Hintergründe gefunden.`;
  return `Zu ${s.title}: ${spokenTrivia(lines)}`;
}

export const onOff = (v: string | undefined) => (v === "an" ? true : v === "aus" ? false : undefined);

/** Uhrzeit in Wien („20:15“) */
function viennaTime(ms: number) {
  return new Intl.DateTimeFormat("de-AT", { timeZone: "Europe/Vienna", hour: "2-digit", minute: "2-digit" }).format(ms);
}

/** „A“, „A und B“, „A, B und C“ */
function listText(xs: readonly string[]) {
  return xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} und ${xs.at(-1)}`;
}

/** „Was klingt ähnlich?“ – zum laufenden Song, sonst die Tipps aus dem Abend */
export function similarAnswer(s: Snapshot | null): string {
  const similar = s?.user?.similar?.slice(0, 3);
  if (s && similar?.length) return `Wenn dir ${s.artists[0]?.name ?? s.title} gefällt, hör mal in ${listText(similar)} rein.`;
  const tips = s?.evening?.tips?.slice(0, 3);
  if (tips?.length) return `Passend zum heutigen Abend: ${listText(tips)}.`;
  return "Dazu kenne ich gerade keine ähnlichen Künstler. Dafür braucht das Dashboard einen Last.fm-Schlüssel.";
}

/** „Wie war der Abend?“ – aus dem Rückblick des Kiosks (letzte Meldung, auch wenn die Musik schon aus ist) */
export function eveningAnswer(s: Snapshot | null): string {
  const e = s?.evening;
  if (!e) return "Heute Abend lief noch nicht genug Musik für einen Rückblick.";
  const dauer = e.minutes >= 60 ? `${Math.floor(e.minutes / 60)} Stunden und ${e.minutes % 60} Minuten` : `${e.minutes} Minuten`;
  const parts = [`Seit ${viennaTime(e.since)} Uhr liefen ${e.songs} Songs in ${dauer}.`];
  if (e.highlights.length) parts.push(`Höhepunkt war ${e.highlights.slice(0, 2).join(" und ")}.`);
  if (e.encores.length) parts.push(`Als Zugabe gab es ${e.encores[0]}.`);
  if (e.topArtist) parts.push(`Am meisten lief ${e.topArtist.name} mit ${e.topArtist.songs} Songs.`);
  if (e.liked) parts.push(e.liked === 1 ? "Ein Lieblingssong war auch dabei." : `${e.liked} Lieblingssongs waren dabei.`);
  if (e.tips?.length) parts.push(`Tipp fürs nächste Mal: ${listText(e.tips.slice(0, 3))}.`);
  return parts.join(" ");
}

export const EFFECT_NAMES: Partial<Record<EffectKind, string>> = {
  konfetti: "Konfetti",
  feuerwerk: "Feuerwerk",
  flammen: "Flammen",
  schaum: "Schaum",
  co2: "Nebel",
  pyro: "Funkenfontänen",
  funken: "kalte Funken",
  glitzer: "Spiegelkugel",
};
