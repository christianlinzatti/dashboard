/**
 * Canvas-Medien kommen über die eigene Domain (/api/canvas/video): Die Content-Security-Policy lässt fremde Videos
 * nicht zu, und als Textur auf der Bühnen-Leinwand braucht WebGL Medien ohne fremde Herkunft.
 * Weitergereicht wird nur, was Spotify für diesen Track als Canvas nennt, und nur von Spotifys Medien-Servern.
 */
/** Spotifys Medien-Server (Canvas liegt heute auf canvaz.scdn.co) */
export const CANVAS_MEDIA_DOMAINS = ["scdn.co", "spotifycdn.com"] as const;

export function isCanvasMediaUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" && !u.port && CANVAS_MEDIA_DOMAINS.some((d) => u.hostname === d || u.hostname.endsWith(`.${d}`))
    );
  } catch {
    return false;
  }
}

/** Adresse, unter der der Browser das Canvas eines Tracks lädt */
export const canvasMediaPath = (trackId: string) => `/api/canvas/video?track=${encodeURIComponent(trackId)}`;

/** Kopfzeilen, die von Spotifys Antwort an den Browser gehen (Video-Spulen braucht Range) */
const PASS_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"];

export function mediaHeaders(upstream: Headers): Headers {
  const out = new Headers();
  for (const h of PASS_HEADERS) {
    const v = upstream.get(h);
    if (v) out.set(h, v);
  }
  const type = out.get("content-type") ?? "";
  // nur Video/Bild durchlassen – sonst neutral, damit der Browser nichts anderes daraus macht
  if (!/^(video|image)\//.test(type)) out.set("content-type", "application/octet-stream");
  out.set("cache-control", "private, max-age=86400");
  out.set("x-content-type-options", "nosniff");
  return out;
}
