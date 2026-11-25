import { describe, expect, it } from "vitest";
import { canvasLayout, coverCrop, WALL_H, WALL_W } from "@/lib/stage/canvas-wall";
import { canvasMediaPath, isCanvasMediaUrl, mediaHeaders } from "@/lib/spotify/canvas-media";
import { canvasModeFrom } from "@/lib/settings";

describe("Canvas auf der LED-Wand", () => {
  it("Hochkant: volle Höhe mittig, Füllung schneidet passend zu", () => {
    const l = canvasLayout(9 / 16);
    expect(l.main.height).toBeCloseTo(WALL_H * 0.96);
    expect(l.main.width).toBeCloseTo(WALL_H * 0.96 * (9 / 16));
    expect(l.main.repeat).toEqual([1, 1]);
    const wall = WALL_W / WALL_H;
    expect(l.fill!.repeat[0]).toBe(1);
    expect(l.fill!.repeat[1]).toBeCloseTo(9 / 16 / wall);
    expect(l.fill!.offset[1]).toBeCloseTo((1 - 9 / 16 / wall) / 2);
  });

  it("Querformat füllt die Wand allein; unbrauchbares Seitenverhältnis gilt als 9:16", () => {
    const l = canvasLayout(16 / 9);
    expect(l.fill).toBeNull();
    expect([l.main.width, l.main.height]).toEqual([WALL_W, WALL_H]);
    expect(canvasLayout(NaN)).toEqual(canvasLayout(9 / 16));
    expect(canvasLayout(0)).toEqual(canvasLayout(9 / 16));
  });

  it("cover: breiter als die Fläche → seitlich beschneiden", () => {
    expect(coverCrop(4, 2)).toEqual({ repeat: [0.5, 1], offset: [0.25, 0] });
    expect(coverCrop(1, 2)).toEqual({ repeat: [1, 0.5], offset: [0, 0.25] });
  });
});

describe("Canvas-Medien über die eigene Domain", () => {
  it("nur Spotifys Medien-Server per https", () => {
    expect(isCanvasMediaUrl("https://canvaz.scdn.co/upload/x.cnvs.mp4")).toBe(true);
    expect(isCanvasMediaUrl("https://canvaz.spotifycdn.com/x.mp4")).toBe(true);
    expect(isCanvasMediaUrl("http://canvaz.scdn.co/x.mp4")).toBe(false);
    expect(isCanvasMediaUrl("https://canvaz.scdn.co:8443/x.mp4")).toBe(false);
    expect(isCanvasMediaUrl("https://evilscdn.co/x.mp4")).toBe(false);
    expect(isCanvasMediaUrl("https://scdn.co.evil.com/x.mp4")).toBe(false);
    expect(isCanvasMediaUrl("kein link")).toBe(false);
    expect(canvasMediaPath("abc")).toBe("/api/canvas/video?track=abc");
  });

  it("reicht Video-Kopfzeilen durch, sonst neutral", () => {
    const h = mediaHeaders(
      new Headers({ "content-type": "video/mp4", "content-length": "10", "content-range": "bytes 0-9/10", "set-cookie": "x" }),
    );
    expect(h.get("content-type")).toBe("video/mp4");
    expect(h.get("content-range")).toBe("bytes 0-9/10");
    expect(h.get("set-cookie")).toBeNull();
    expect(h.get("cache-control")).toBe("private, max-age=86400");
    expect(mediaHeaders(new Headers({ "content-type": "text/html" })).get("content-type")).toBe("application/octet-stream");
    expect(mediaHeaders(new Headers()).get("content-type")).toBe("application/octet-stream");
  });
});

describe("Einstellung Canvas", () => {
  it("übernimmt die alte An/Aus-Einstellung", () => {
    expect(canvasModeFrom(true)).toBe("vollbild");
    expect(canvasModeFrom(false)).toBe("aus");
    expect(canvasModeFrom("buehne")).toBe("buehne");
    expect(canvasModeFrom("kino")).toBe("aus");
    expect(canvasModeFrom(undefined)).toBe("aus");
  });
});
