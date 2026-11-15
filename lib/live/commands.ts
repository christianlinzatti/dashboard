import type { Command } from "@/lib/song-context/snapshot";
import type { Settings } from "@/lib/settings";
import { isThemeChoice } from "@/lib/stage/themes";

/** Übersetzt einen Befehl (z. B. von Alexa) in eine Änderung der Geräte-Einstellungen. */
export function settingsPatchFor(cmd: Pick<Command, "type"> & Record<string, unknown>): Partial<Settings> | null {
  switch (cmd.type) {
    case "lampen":
      return { lamps: Boolean(cmd.on) };
    case "strobo":
      return { strobe: Boolean(cmd.on) };
    case "qualitaet":
      return { quality: cmd.value as Settings["quality"] };
    case "buehne":
      return isThemeChoice(cmd.value) ? { stage: cmd.value } : null;
    default:
      return null;
  }
}
