import { afterEach, describe, expect, it, vi } from "vitest";
import { composePhoto, PHOTO_WIDTH, photoDate } from "@/lib/photo/compose";
import { drawRecap, RECAP_H, RECAP_W } from "@/lib/show/recap-image";
import type { Recap } from "@/lib/show/recap";

/** 2D-Kontext zum Mitschreiben: jedes Zeichen ist 10 px breit, Texte landen in `texts` */
function fakeContext() {
  const texts: Array<{ text: string; x: number; y: number; font: string; align: string }> = [];
  const images: Array<{ src: unknown; args: number[] }> = [];
  const rects: number[][] = [];
  const gradient = () => ({ addColorStop: vi.fn() });
  const ctx = {
    font: "",
    fillStyle: "" as unknown,
    textAlign: "left",
    textBaseline: "",
    shadowColor: "",
    shadowBlur: 0,
    measureText: (t: string) => ({ width: t.length * 10 }),
    fillText(text: string, x: number, y: number) {
      texts.push({ text, x, y, font: this.font, align: this.textAlign });
    },
    drawImage: (src: unknown, ...args: number[]) => void images.push({ src, args }),
    fillRect: (...r: number[]) => void rects.push(r),
    createLinearGradient: gradient,
    createRadialGradient: gradient,
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
  };
  return { ctx, texts, images, rects };
}

const recap = (over: Partial<Recap> = {}): Recap =>
  ({
    songs: 12,
    minutes: 95,
    since: 0,
    liked: 1,
    highlights: ["Bussi Baby"],
    encores: ["Columbo"],
    topArtist: { name: "Wanda", songs: 5 },
    tips: ["Bilderbuch"],
    recent: [
      {
        trackKey: "a",
        title: "Bussi Baby",
        artist: "Wanda",
        durationMs: 1,
        at: 0,
        liked: true,
        phase: "hoehepunkt",
        coverUrl: "/c/a",
      },
      { trackKey: "b", title: "Maschin", artist: "Bilderbuch", durationMs: 1, at: 0 },
    ],
    ...over,
  }) as Recap;

describe("Rückblick als Bild", () => {
  it("zeichnet Überschrift, Eckdaten, Zeilen, Songs mit Cover und Tipp", () => {
    const { ctx, texts, images } = fakeContext();
    const cover = { id: "cover" };
    drawRecap(ctx as unknown as CanvasRenderingContext2D, recap(), new Map([["/c/a", cover as unknown as CanvasImageSource]]), {
      date: "Di., 24. Nov. 2026",
    });
    const all = texts.map((t) => t.text);
    expect(all).toContain("DI., 24. NOV. 2026");
    expect(all).toContain("Unser Abend");
    expect(all).toContain("12 Songs · 1 Std. 35 Min. · 1 Lieblingssong");
    expect(all).toEqual(expect.arrayContaining(["Höhepunkt", "Zugabe", "Meistgespielt", "Wanda (5 Songs)", "♥ Bussi Baby"]));
    expect(all).toContain("Wanda · Höhepunkt");
    expect(all).toContain("Bilderbuch");
    expect(all).toContain("Tipp fürs nächste Mal: Bilderbuch");
    expect(all).toContain("Sonic Stage");
    // nur das Cover von der eigenen Adresse, der zweite Song bekommt ein Farbfeld
    expect(images).toHaveLength(1);
    expect(images[0]!.src).toBe(cover);
    // alles bleibt im Bild
    for (const t of texts) {
      expect(t.y).toBeLessThanOrEqual(RECAP_H);
      expect(t.x + t.text.length * 10).toBeLessThanOrEqual(RECAP_W);
    }
  });

  it("kürzt lange Texte mit … und lässt leere Abschnitte weg", () => {
    const { ctx, texts } = fakeContext();
    const long = "Sehr langer Titel ".repeat(10);
    drawRecap(
      ctx as unknown as CanvasRenderingContext2D,
      recap({
        highlights: [],
        encores: [],
        topArtist: undefined,
        tips: [],
        liked: 0,
        minutes: 40,
        recent: [{ trackKey: "x", title: long, artist: "A", durationMs: 1, at: 0 }],
      } as Partial<Recap>),
      new Map(),
      { date: "heute", accent: "#00ffaa" },
    );
    const all = texts.map((t) => t.text);
    expect(all).toContain("12 Songs · 40 Min.");
    expect(all).not.toContain("Höhepunkt");
    expect(all.some((t) => t.startsWith("Tipp"))).toBe(false);
    const title = all.find((t) => t.startsWith("Sehr langer"))!;
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThan(long.length);
  });

  it("zeigt höchstens so viele Songs, wie aufs Bild passen", () => {
    const { ctx, images } = fakeContext();
    const recent = Array.from({ length: 10 }, (_, i) => ({
      trackKey: `${i}`,
      title: `S${i}`,
      artist: "A",
      durationMs: 1,
      at: 0,
      coverUrl: "/c",
    }));
    drawRecap(
      ctx as unknown as CanvasRenderingContext2D,
      recap({ recent } as Partial<Recap>),
      new Map([["/c", {} as CanvasImageSource]]),
      {
        date: "x",
      },
    );
    expect(images.length).toBeGreaterThan(0);
    expect(images.length).toBeLessThanOrEqual(6);
  });
});

describe("Erinnerungsfoto zusammensetzen", () => {
  afterEach(() => vi.unstubAllGlobals());

  function withCanvas() {
    const fake = fakeContext();
    const canvas = { width: 0, height: 0, getContext: () => fake.ctx };
    vi.stubGlobal("document", { createElement: (tag: string) => (tag === "canvas" ? canvas : null) });
    return { canvas, ...fake };
  }

  it("verkleinert breite Bilder auf 1280 px und schreibt Zeile, Titel und Absender", () => {
    const { canvas, texts, images } = withCanvas();
    const img = { width: 2560, height: 1600 };
    const out = composePhoto(img as unknown as CanvasImageSource & { width: number; height: number }, {
      title: "Bussi Baby",
      artist: "Wanda",
      line: "Eine Zeile",
      date: "Di., 24. Nov. 2026",
    });
    expect(out).toBe(canvas);
    expect([canvas.width, canvas.height]).toEqual([PHOTO_WIDTH, 800]);
    expect(images[0]!.args).toEqual([0, 0, PHOTO_WIDTH, 800]);
    const all = texts.map((t) => t.text);
    expect(all).toContain("„Eine Zeile“");
    expect(all).toContain("Bussi Baby · Wanda · Di., 24. Nov. 2026");
    expect(texts.find((t) => t.text === "Sonic Stage")?.align).toBe("right");
  });

  it("lässt kleine Bilder in Originalgröße, ohne Zeile nur die Fußzeile; zu lange Zeilen werden gekürzt", () => {
    const { canvas, texts } = withCanvas();
    composePhoto({ width: 640, height: 400 } as unknown as CanvasImageSource & { width: number; height: number }, {
      title: "T".repeat(200),
      artist: "A",
      date: "D",
    });
    expect([canvas.width, canvas.height]).toEqual([640, 400]);
    expect(texts).toHaveLength(2);
    expect(texts[0]!.text.endsWith("…")).toBe(true);
  });

  it("Datum auf Deutsch", () => {
    expect(photoDate(Date.UTC(2026, 10, 24, 12))).toMatch(/24\. Nov\. 2026/);
  });
});
