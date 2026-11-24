/**
 * Alexa-Skill: nimmt eine geprüfte Anfrage entgegen und verteilt sie auf die Antworten (./answers) oder auf Befehle an
 * die Bühne. Das Anfrage-Schema steht in ./request, die Signaturprüfung in ./verify.
 */
import type { CommandInput, Snapshot } from "@/lib/song-context/snapshot";
import { effectKinds, isThemeChoice, THEMES, type EffectKind } from "@/lib/stage/themes";
import {
  EFFECT_NAMES,
  aboutAnswer,
  artistsText,
  concertAnswer,
  eveningAnswer,
  likeAnswer,
  onOff,
  playsAnswer,
  similarAnswer,
  todayVienna,
  triviaAnswer,
} from "./answers";
import { slot, slotRaw, speak, type AlexaRequest } from "./request";
import { SNAPSHOT_STALE_MS as STALE_MS } from "@/lib/cache-policy";

export { alexaRequestSchema, speak, type AlexaRequest } from "./request";
export { eveningAnswer, similarAnswer, spokenDate, todayVienna } from "./answers";
export { SNAPSHOT_STALE_MS as STALE_MS } from "@/lib/cache-policy";

export type HandlerDeps = {
  getSnapshot: () => Promise<Snapshot | null>;
  pushCommand: (c: CommandInput) => Promise<unknown>;
  now?: () => number;
};

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
    case "MottoIntent": {
      const s = await live();
      if (!s) return speak("Das Dashboard ist gerade nicht aktiv.");
      return speak(s.motto ? `Das Motto zu ${s.title}: ${s.motto}` : `Zu ${s.title} gibt es gerade kein Motto.`);
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
      if (!isThemeChoice(value))
        return speak(
          "Welche Bühne? Club, Festival, Synthwave, Jazz, Weltraum, Stadion, Strand, Lagerhalle oder Kathedrale.",
          false,
        );
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
    case "AbendIntent":
      // auch nach der Musik: der letzte Stand (bis zu zwei Stunden alt) enthält den Rückblick
      return speak(eveningAnswer(await deps.getSnapshot()));
    case "AehnlichIntent": {
      // läuft nichts mehr, helfen die Tipps aus dem Rückblick (letzter Stand)
      const s = (await live()) ?? (await deps.getSnapshot());
      return speak(similarAnswer(s));
    }
    case "BildschirmIntent": {
      const on = onOff(slot(req, "zustand"));
      if (on === undefined) return speak("Soll ich den Bildschirm an- oder ausschalten?", false);
      await deps.pushCommand({ type: "bildschirm", on });
      return speak(on ? "Bildschirm an." : "Bildschirm aus. Antippen oder sag Bildschirm an, dann ist er wieder da.");
    }
    case "FotoIntent": {
      if (!(await live())) return speak("Das Dashboard ist gerade nicht aktiv.");
      await deps.pushCommand({ type: "foto" });
      return speak("Bitte lächeln! Das Foto erscheint gleich mit QR-Code auf dem Bildschirm.");
    }
    case "LyricsVersatzIntent": {
      const r = slot(req, "richtung");
      const deltaMs = r === "spaeter" ? 200 : r === "frueher" ? -200 : 0;
      if (!deltaMs) return speak("Sollen die Lyrics früher oder später kommen?", false);
      await deps.pushCommand({ type: "versatz", deltaMs });
      return speak(deltaMs > 0 ? "Die Lyrics kommen etwas später." : "Die Lyrics kommen etwas früher.");
    }
    case "EffektIntent": {
      const v = slot(req, "effekt");
      const kind = (effectKinds as readonly string[]).includes(v ?? "") ? (v as EffectKind) : undefined;
      if (!kind) return speak("Welcher Effekt? Konfetti, Feuerwerk, Flammen, Schaum oder Nebel.", false);
      const s = await live();
      if (!s) return speak("Das Dashboard ist gerade nicht aktiv.");
      if (s.stage && !s.stage.effects.includes(kind))
        return speak(`Auf der Bühne ${THEMES[s.stage.id].label} gibt es kein ${EFFECT_NAMES[kind] ?? kind}.`);
      await deps.pushCommand({ type: "effekt", kind });
      return speak(`${EFFECT_NAMES[kind] ?? kind}!`);
    }
    case "AMAZON.HelpIntent":
      return speak(
        "Du kannst fragen: Welcher Song läuft? Wer singt gerade? Wann spielen die in der Nähe? Erzähl mir was über die Band. Wie war der Abend? Was klingt ähnlich? Oder sagen: Konfetti, Feuerwerk, mach ein Foto, Lyrics später, Bildschirm aus, Lampen aus, Bühne Weltraum.",
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
