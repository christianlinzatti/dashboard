import type { Command } from "@/lib/song-context/snapshot";
import type { Settings } from "@/lib/settings";

/** Übersetzt einen Befehl (z. B. von Alexa) in eine Änderung der Geräte-Einstellungen. */
export function settingsPatchFor(cmd: Pick<Command, "type"> & Record<string, unknown>): Partial<Settings> | null {
  switch (cmd.type) {
    case "lampen":
      return { lamps: Boolean(cmd.on) };
    case "strobo":
      return { strobe: Boolean(cmd.on) };
    case "qualitaet":
      return { quality: cmd.value as Settings["quality"] };
    default:
      return null;
  }
}
