import { describe, expect, it } from "vitest";
import { parseTraceInfo, traceText } from "@/components/debug/AiTraceView";

const trace = {
  provider: "openai" as const,
  model: "gpt-5.4-mini",
  servedModel: "gpt-5.4-mini-2026",
  at: 1,
  ms: 900,
  system: "Du bist die Show-Regie.",
  user: "Titel: Neonlicht",
  response: '{"stage":"club"}',
  outcome: "ok" as const,
};

describe("KI-Mitschrift im Debug", () => {
  it("Frage und Antwort als ein Text, Antwort eingerückt", () => {
    const t = traceText(trace);
    expect(t).toContain("# Anweisung (System)\nDu bist die Show-Regie.");
    expect(t).toContain("# Frage (Song)\nTitel: Neonlicht");
    expect(t).toContain('# Antwort (gpt-5.4-mini-2026)\n{\n  "stage": "club"\n}');
    expect(traceText({ ...trace, response: undefined, error: "401 invalid key", outcome: "konfiguration" })).toContain(
      "401 invalid key",
    );
  });

  it("liest den gesendeten Kontext tolerant", () => {
    expect(parseTraceInfo({ ai: { provider: "openai", model: "gpt-5.4-mini" }, trace })).toEqual({
      ai: { provider: "openai", model: "gpt-5.4-mini" },
      trace,
    });
    expect(parseTraceInfo({ ai: null, trace: { kaputt: true } })).toEqual({ ai: null, trace: null });
    expect(parseTraceInfo("unsinn")).toBeNull();
  });
});
