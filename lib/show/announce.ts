import { hash } from "@/lib/avatars/casting";
import type { SongStatic } from "@/lib/song-context/schema";
import type { EveningPhase } from "./evening";

/**
 * Ansage des Sängers zum Songstart – wie auf einem echten Konzert: Begrüßung beim ersten Song, Anheizen beim
 * Höhepunkt, ruhige Worte vor einer Ballade, Dank bei der Zugabe. Feste Vorlagen (sofort, ohne KI), je Song eine
 * andere, aber für denselben Song immer dieselbe. `{t}` = Songtitel, `{s}` = Stadt (Heimatort).
 */
type Lines = { mitStadt: string[]; ohne: string[] };

const LINES: Record<EveningPhase | "lieblingssong", Lines> = {
  auftakt: {
    mitStadt: [
      "Servus {s}! Schön, dass ihr da seid – los geht's mit „{t}“!",
      "Guten Abend, {s}! Seid ihr bereit? Das hier ist „{t}“!",
      "{s}, was für ein Anblick! Wir fangen an mit „{t}“!",
    ],
    ohne: ["Servus! Schön, dass ihr da seid – los geht's mit „{t}“!", "Guten Abend! Seid ihr bereit? Das hier ist „{t}“!"],
  },
  steigerung: {
    mitStadt: ["Weiter geht's, {s} – „{t}“!", "{s}, ich will eure Hände sehen! „{t}“!", "Den nächsten kennt ihr, {s}: „{t}“!"],
    ohne: ["Weiter geht's – „{t}“!", "Ich will eure Hände sehen! „{t}“!", "Den nächsten kennt ihr: „{t}“!", "Hier kommt „{t}“!"],
  },
  hoehepunkt: {
    mitStadt: ["Jetzt wird's laut, {s}! „{t}“!", "{s}, alle springen – „{t}“!"],
    ohne: ["Jetzt wird's laut! „{t}“!", "Alle springen – „{t}“!", "Lauter! „{t}“!"],
  },
  durchatmen: {
    mitStadt: ["Wir machen's mal ein bisschen ruhiger, {s} … „{t}“.", "Handys raus, Lichter an, {s} – „{t}“."],
    ohne: ["Wir machen's mal ein bisschen ruhiger … „{t}“.", "Handys raus, Lichter an – „{t}“."],
  },
  zugabe: {
    mitStadt: ["Ihr wollt noch einen? Bitte schön, {s} – „{t}“!", "Zugabe! Danke, {s} – „{t}“!"],
    ohne: ["Ihr wollt noch einen? Bitte schön – „{t}“!", "Zugabe! Danke euch – „{t}“!"],
  },
  lieblingssong: {
    mitStadt: ["Den hier liebt ihr, {s}, oder? „{t}“!", "{s}, singt mit – „{t}“!"],
    ohne: ["Den hier liebt ihr, oder? „{t}“!", "Singt mit – „{t}“!"],
  },
};

export type AnnounceInput = {
  trackKey: string;
  title: string;
  phase: EveningPhase;
  /** Song in den Lieblingssongs (Spotify/Last.fm) */
  liked?: boolean;
  /** Heimatort aus den Einstellungen */
  city?: string;
  /** Ansagen der KI-Regie für diesen Song (je Abendphase) – haben Vorrang vor den Vorlagen */
  ai?: Partial<Record<EveningPhase, string>>;
};

/** `{s}` durch den Ort ersetzen – ohne Ort samt Komma/Leerzeichen streichen („Servus {s}!“ → „Servus!“) */
export function fillCity(line: string, city: string | undefined): string {
  if (city) return line.replaceAll("{s}", city);
  return line
    .replace(/,?\s*\{s\}\s*,?/g, " ")
    .replace(/\s+([!?.,…])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Titel ohne Zusätze („– Remastered 2011“, „(feat. …)“), damit die Ansage natürlich klingt */
export function spokenTitle(title: string): string {
  return (
    title
      .replace(/\s*[([][^)\]]*[)\]]\s*$/, "")
      .replace(/\s+[-–]\s+.*(remaster|version|edit|mix|live).*$/i, "")
      .trim() || title
  );
}

export function announcementFor(i: AnnounceInput): string {
  const ai = i.ai?.[i.phase];
  if (ai) return fillCity(ai, i.city);
  // Lieblingssong (außer bei Auftakt/Zugabe, die haben ihre eigenen Worte): jeder zweite bekommt den Mitsing-Aufruf
  const key =
    i.liked && i.phase !== "auftakt" && i.phase !== "zugabe" && hash(`${i.trackKey}:lieb`) % 2 === 0 ? "lieblingssong" : i.phase;
  const lines = LINES[key];
  const pool = i.city ? lines.mitStadt : lines.ohne;
  const line = pool[hash(`${i.trackKey}:ansage`) % pool.length]!;
  return fillCity(line.replaceAll("{t}", spokenTitle(i.title)), i.city);
}

/**
 * Tour-Banner über dem Motto: „Wanda · Tourname“ (setlist.fm kennt die aktuelle Tour), sonst „Wanda · Live in Wien“
 * (Heimatort) bzw. „Wanda · Live“.
 */
export function tourLine(song: Pick<SongStatic, "artists"> & Partial<Pick<SongStatic, "setlists" | "concertArea">>): string {
  const lead = song.artists[0];
  if (!lead) return "Live";
  const tour = song.setlists?.[lead.spotifyId]?.tour?.trim();
  const city = song.concertArea?.name;
  return `${lead.name} · ${tour && tour.length <= 40 ? tour : city ? `Live in ${city}` : "Live"}`;
}
