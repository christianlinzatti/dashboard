import { beforeEach, describe, expect, it } from "vitest";
import { eveningPhase, isBigNight } from "@/lib/show/evening";
import { eveningPhaseFor, setlistStore } from "@/lib/stage/setlist";
import { planChoreography } from "@/lib/dance/plan";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";
import { planEffects } from "@/lib/stage/effects";
import { THEMES } from "@/lib/stage/themes";
import { runCommand } from "@/lib/live/run-command";
import { creditsRequest } from "@/lib/show/credits";

const E = { mood: "energetisch" as const };
const R = { mood: "ruhig" as const };

describe("Spannungsbogen des Abends", () => {
  it("Auftakt, Steigerung, Höhepunkt nach drei energiegeladenen Songs, Durchatmen danach", () => {
    expect(eveningPhase([], "energetisch")).toBe("auftakt");
    expect(eveningPhase([E], "energetisch")).toBe("steigerung");
    expect(eveningPhase([E, E], "energetisch")).toBe("hoehepunkt");
    expect(eveningPhase([R, E], "energetisch")).toBe("steigerung");
    expect(eveningPhase([E, E], "ruhig")).toBe("durchatmen");
    expect(eveningPhase([E], "ruhig")).toBe("steigerung");
  });

  it("Zugabe nach einem ausgespielten Höhepunkt oder Lieblingssong – nicht nach Skip, nie zweimal", () => {
    expect(eveningPhase([{ ...E, phase: "hoehepunkt", finished: true }], "mittel")).toBe("zugabe");
    expect(eveningPhase([{ ...R, liked: true, finished: true }], "ruhig")).toBe("zugabe");
    expect(eveningPhase([{ ...E, phase: "hoehepunkt", finished: false }], "mittel")).toBe("steigerung");
    expect(eveningPhase([{ ...E, phase: "zugabe", liked: true, finished: true }], "energetisch")).not.toBe("zugabe");
  });

  it("großes Programm: Feuerwerk schon beim ersten großen Einsatz", () => {
    expect(isBigNight("zugabe")).toBe(true);
    expect(isBigNight("steigerung")).toBe(false);
    const plan = planChoreography(neonlicht, 124);
    const first = plan.climaxes.find((k) => k.countdown && !k.finale)!;
    const normal = planEffects(plan, THEMES.festival);
    const big = planEffects(plan, THEMES.festival, { bigNight: true });
    const fwAt = (cues: typeof normal) => cues.filter((c) => c.kind === "feuerwerk" && c.startMs < first.atMs + 2 * plan.barMs);
    expect(fwAt(normal)).toHaveLength(0);
    expect(fwAt(big).length).toBeGreaterThan(0);
  });
});

describe("Setlist: ausgespielte Songs", () => {
  beforeEach(() => setlistStore.getState().reset());

  it("finish markiert nur den laufenden Song; Neuplanung behält die Markierung", () => {
    const s = setlistStore.getState();
    s.record({ trackKey: "a", theme: "club", clips: [], mood: "energetisch", phase: "hoehepunkt" });
    s.finish("x");
    expect(setlistStore.getState().played.at(-1)?.finished).toBeUndefined();
    s.finish("a");
    expect(setlistStore.getState().played.at(-1)?.finished).toBe(true);
    s.record({ trackKey: "a", theme: "club", clips: ["k"], mood: "energetisch", phase: "hoehepunkt" });
    expect(setlistStore.getState().played).toHaveLength(1);
    expect(setlistStore.getState().played.at(-1)?.finished).toBe(true);
    // der nächste Song ist die Zugabe
    expect(eveningPhaseFor(setlistStore.getState().played, "b", "mittel")).toBe("zugabe");
    // für den Song selbst zählt nur, was vorher lief
    expect(eveningPhaseFor(setlistStore.getState().played, "a", "energetisch")).toBe("auftakt");
  });
});

describe("Zugabe auf Zuruf", () => {
  it("nach dem Ruf wird der nächste Song die Zugabe – auch ohne Like, auch geskippt; nie zweimal", () => {
    expect(eveningPhase([{ mood: "mittel", phase: "steigerung", encoreAsked: true }], "mittel")).toBe("zugabe");
    expect(eveningPhase([{ mood: "mittel", phase: "zugabe", encoreAsked: true }], "mittel")).toBe("steigerung");
  });

  it("der Setlist-Speicher merkt sich den Ruf am zuletzt gespielten Song", () => {
    setlistStore.getState().reset();
    expect(setlistStore.getState().askEncore()).toBe(false);
    setlistStore.getState().record({ trackKey: "a", mood: "mittel", phase: "auftakt" });
    expect(setlistStore.getState().askEncore()).toBe(true);
    expect(eveningPhaseFor(setlistStore.getState().played, "b", "mittel")).toBe("zugabe");
    setlistStore.getState().reset();
  });

  it("Befehle aus dem Kiosk: Zugabe und Abspann", () => {
    setlistStore.getState().reset();
    setlistStore.getState().record({ trackKey: "a", mood: "mittel", phase: "auftakt" });
    runCommand({ type: "zugabe", id: "1", createdAt: 0 });
    expect(setlistStore.getState().played.at(-1)?.encoreAsked).toBe(true);
    expect(creditsRequest.getState().at).toBeNull();
    runCommand({ type: "abspann", id: "2", createdAt: 0 });
    expect(creditsRequest.getState().at).not.toBeNull();
    creditsRequest.getState().clear();
    setlistStore.getState().reset();
  });
});
