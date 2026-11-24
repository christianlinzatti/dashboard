import type { Photo } from "@/lib/song-context/schema";

/** Hosts, deren Bilder über den Next.js-Bildoptimierer laufen (eigene Domain: kein CORS-Problem, kleinere Dateien). */
export const PROXIED_IMAGE_HOSTS = [
  "r2.theaudiodb.com",
  "www.theaudiodb.com",
  "live.staticflickr.com",
  "lastfm.freetls.fastly.net",
];
/** Breiten, die der Bildoptimierer ausliefert – müssen in next.config.ts (deviceSizes/imageSizes) stehen */
export const PROXY_WIDTHS = [128, 640, 1280] as const;

/** Bild-URL für Anzeige und WebGL-Textur; Fremd-Hosts ohne CORS über /_next/image. */
export function displayUrl(url: string, width: (typeof PROXY_WIDTHS)[number] = 1280): string {
  try {
    const u = new URL(url);
    if (u.protocol === "https:" && PROXIED_IMAGE_HOSTS.includes(u.hostname)) {
      return `/_next/image?${new URLSearchParams({ url, w: String(width), q: "75" })}`;
    }
  } catch {
    /* relative Demo-Pfade bleiben unverändert */
  }
  return url;
}

export const aspect = (p: Photo) =>
  p.width && p.height ? p.width / p.height : p.kind === "fanart" ? 16 / 9 : p.kind === "thumb" ? 1 : 1.3;

/**
 * Punkte für die Fotoauswahl.
 * - Wand (16:9, eingefärbt): Querformat, Bühnenbilder (Fanart) ohne Text, hohe Auflösung.
 * - Karte (Ausschnitt ~3:4): Porträt/quadratisch, echte Fotos mit klarer Lizenz.
 */
export function photoScore(p: Photo, use: "wall" | "card"): number {
  const a = aspect(p);
  const px = p.width ?? (p.kind === "fanart" ? 1280 : 700);
  let s = Math.min(px, 1920) / 1920; // 0..1 Auflösung
  if (use === "wall") {
    s += a >= 1.5 ? 2 : a >= 1.2 ? 1 : a >= 0.95 ? 0 : -1; // Hochformat ist auf der Wand am schlechtesten
    s += p.kind === "fanart" ? 1.5 : 0;
  } else {
    s += a <= 1.1 ? 2 : a <= 1.5 ? 1 : 0;
    s += p.kind === "thumb" ? 1 : 0;
    s += p.source === "commons" ? 0.5 : 0; // Commons: geprüfte freie Lizenz, meist Porträt
  }
  return s;
}

export function rankPhotos(photos: Photo[], use: "wall" | "card"): Photo[] {
  return photos
    .map((p, i) => ({ p, s: photoScore(p, use), i }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.p);
}

/**
 * Abwechslung: zuerst das beste Foto jeder Quelle (Wikipedia/Commons, TheAudioDB, Flickr), dann der Rest nach Rang.
 * Sonst stehen z. B. vier Bühnenbilder von TheAudioDB immer vor dem Wikipedia-Foto, und das kommt nie dran.
 */
export function diversify(ranked: Photo[]): Photo[] {
  const seen = new Set<string>();
  const first = ranked.filter((p) => {
    const src = p.source ?? "?";
    if (seen.has(src)) return false;
    seen.add(src);
    return true;
  });
  return [...first, ...ranked.filter((p) => !first.includes(p))];
}
