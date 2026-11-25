import { settingsPatchFor } from "./commands";
import { setLiked } from "@/lib/personal/like";
import { settings } from "@/lib/settings";
import type { Command } from "@/lib/song-context/snapshot";
import { songContext } from "@/lib/song-context/store";
import { offsetStore } from "@/lib/lyrics/offset-store";
import { manualCues } from "@/lib/stage/manual-cues";
import { screenStore } from "./screen";
import { photoStore } from "@/lib/photo/store";
import { creditsRequest } from "@/lib/show/credits";
import { setlistStore } from "@/lib/stage/setlist";

/** Einen Befehl vom Server (Alexa, Fernbedienung) im Kiosk ausführen. */
export function runCommand(c: Command) {
  const patch = settingsPatchFor(c);
  if (patch) settings.getState().set(patch);
  switch (c.type) {
    // „Alexa, merk dir den Song“ – gilt dem Song, der beim Sprechen lief (auch wenn er inzwischen gewechselt hat)
    case "merken":
      void setLiked(c.on, fetch, c.trackKey);
      break;
    case "versatz":
      offsetStore.getState().changeManual(c.deltaMs);
      break;
    case "effekt": {
      const s = songContext.getState();
      if (s.song) manualCues.getState().fire(s.song.trackKey, c.kind, s.positionMs);
      break;
    }
    case "bildschirm":
      screenStore.getState().set(c.on);
      break;
    case "foto":
      photoStore.getState().request();
      break;
    case "abspann":
      creditsRequest.getState().request();
      break;
    case "zugabe":
      setlistStore.getState().askEncore();
      break;
  }
}
