/**
 * Erinnerungsfoto zusammensetzen: Bühnenbild (auf höchstens 1280 px Breite), unten ein Verlauf mit der Songzeile in
 * Anführungszeichen, darunter Titel · Künstler und Datum, rechts klein „Sonic Stage“. Ergebnis als JPEG.
 */
export type PhotoText = { title: string; artist: string; line?: string; date: string };

export const PHOTO_WIDTH = 1280;

/** Zeile auf die Breite kürzen (mit …) */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

export function composePhoto(img: CanvasImageSource & { width: number; height: number }, text: PhotoText): HTMLCanvasElement {
  const scale = Math.min(1, PHOTO_WIDTH / img.width);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  // Verlauf für Lesbarkeit
  const g = ctx.createLinearGradient(0, h * 0.55, 0, h);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = g;
  ctx.fillRect(0, h * 0.55, w, h * 0.45);
  const pad = Math.round(w * 0.04);
  const big = Math.round(w * 0.038);
  const small = Math.round(w * 0.02);
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 8;
  let y = h - pad;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = `600 ${small}px system-ui, sans-serif`;
  ctx.fillText(fit(ctx, `${text.title} · ${text.artist} · ${text.date}`, w - 2 * pad - small * 8), pad, y);
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillText("Sonic Stage", w - pad, y);
  ctx.textAlign = "left";
  if (text.line) {
    y -= small * 1.6;
    ctx.fillStyle = "#fff";
    ctx.font = `800 ${big}px system-ui, sans-serif`;
    ctx.fillText(fit(ctx, `„${text.line}“`, w - 2 * pad), pad, y);
  }
  return c;
}

/** Datum für das Foto: „Di., 24. Nov. 2026“ */
export const photoDate = (at: number) =>
  new Date(at).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
