import { beforeEach, describe, expect, it } from "vitest";
import { runCommand } from "@/lib/live/run-command";
import { screenStore } from "@/lib/live/screen";
import { offsetStore } from "@/lib/lyrics/offset-store";
import { settings } from "@/lib/settings";
import { commandSchema, type Command, type CommandInput } from "@/lib/song-context/snapshot";
import { songContext } from "@/lib/song-context/store";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";
import { manualCue, manualCues } from "@/lib/stage/manual-cues";

const cmd = (c: CommandInput) => ({ ...c, id: "x", createdAt: 0 }) as Command;

describe("Fernbedienung: Befehle im Kiosk", () => {
  beforeEach(() => {
    songContext.getState().setSong(neonlicht);
    songContext.getState().setFrozen(true);
    songContext.getState().setPlayback({ isPlaying: false, positionMs: 61_000, updatedAt: 0 });
    songContext.getState().tick(0);
  });

  it("neue Befehle sind gültig, Unsinn nicht", () => {
    expect(commandSchema.safeParse({ type: "effekt", kind: "konfetti" }).success).toBe(true);
    expect(commandSchema.safeParse({ type: "effekt", kind: "atombombe" }).success).toBe(false);
    expect(commandSchema.safeParse({ type: "versatz", deltaMs: 100 }).success).toBe(true);
    expect(commandSchema.safeParse({ type: "versatz", deltaMs: 99_999 }).success).toBe(false);
    expect(commandSchema.safeParse({ type: "bildschirm", on: false }).success).toBe(true);
  });

  it("Effekt zündet zur aktuellen Songzeit, nur für diesen Song", () => {
    runCommand(cmd({ type: "effekt", kind: "konfetti" }));
    const s = manualCues.getState();
    expect(s.trackKey).toBe(neonlicht.trackKey);
    expect(s.cues.at(-1)).toEqual({ kind: "konfetti", songMs: 61_000 });
    const q = manualCue("feuerwerk", 61_000, { barMs: 2000, beatMs: 500 });
    expect(q).toMatchObject({ kind: "feuerwerk", startMs: 61_000, durationMs: 8000 });
  });

  it("Lyrics-Versatz, Lampen, Bildschirm", () => {
    const before = offsetStore.getState().manual;
    runCommand(cmd({ type: "versatz", deltaMs: 100 }));
    expect(offsetStore.getState().manual).toBe(before + 100);
    runCommand(cmd({ type: "lampen", on: false }));
    expect(settings.getState().lamps).toBe(false);
    runCommand(cmd({ type: "bildschirm", on: false }));
    expect(screenStore.getState().manualOff).toBe(true);
    runCommand(cmd({ type: "bildschirm", on: true }));
    expect(screenStore.getState()).toMatchObject({ manualOff: false, wokeAt: expect.any(Number) });
  });
});
