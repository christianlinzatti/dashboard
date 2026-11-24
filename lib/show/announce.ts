import { hash } from "@/lib/avatars/casting";
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
};

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
  // Lieblingssong (außer bei Auftakt/Zugabe, die haben ihre eigenen Worte): jeder zweite bekommt den Mitsing-Aufruf
  const key =
    i.liked && i.phase !== "auftakt" && i.phase !== "zugabe" && hash(`${i.trackKey}:lieb`) % 2 === 0 ? "lieblingssong" : i.phase;
  const lines = LINES[key];
  const pool = i.city ? lines.mitStadt : lines.ohne;
  const line = pool[hash(`${i.trackKey}:ansage`) % pool.length]!;
  return line.replaceAll("{t}", spokenTitle(i.title)).replaceAll("{s}", i.city ?? "");
}
