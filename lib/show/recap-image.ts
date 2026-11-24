import type { Recap } from "./recap";

/**
 * Rückblick als Bild zum Teilen (Hochformat 1080×1350, passt in Story und Chat): Datum, Eckdaten, Höhepunkt und
 * Zugabe, meistgespielt, die letzten Songs mit Cover, Tipp fürs nächste Mal. Cover nur von der eigenen Adresse
 * (Bild-Proxy) – fremde Bilder würden das Bild für den Export sperren.
 */
export const RECAP_W = 1080;
export const RECAP_H = 1350;

const PHASE: Record<string, string> = { hoehepunkt: "Höhepunkt", zugabe: "Zugabe", durchatmen: "Durchatmen" };

function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

const duration = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} Std. ${min % 60} Min.` : `${min} Min.`);

export function recapFacts(r: Recap): string {
  return [`${r.songs} Songs`, duration(r.minutes), r.liked ? `${r.liked} Lieblingssong${r.liked === 1 ? "" : "s"}` : null]
    .filter(Boolean)
    .join(" · ");
}

export function drawRecap(
  ctx: CanvasRenderingContext2D,
  r: Recap,
  covers: ReadonlyMap<string, CanvasImageSource>,
  opts: { date: string; accent?: string },
) {
  const accent = opts.accent ?? "#ff4fd8";
  const pad = 72;
  // Hintergrund: dunkler Verlauf mit Akzent oben
  const bg = ctx.createLinearGradient(0, 0, 0, RECAP_H);
  bg.addColorStop(0, "#1a0b2e");
  bg.addColorStop(1, "#05030a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, RECAP_W, RECAP_H);
  const glow = ctx.createRadialGradient(RECAP_W * 0.8, 0, 0, RECAP_W * 0.8, 0, 700);
  glow.addColorStop(0, `${accent}66`);
  glow.addColorStop(1, `${accent}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, RECAP_W, RECAP_H);

  ctx.fillStyle = "#fff";
  ctx.textBaseline = "alphabetic";
  let y = pad + 40;
  ctx.font = "600 30px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillText(opts.date.toUpperCase(), pad, y);
  y += 84;
  ctx.font = "900 86px system-ui, sans-serif";
  ctx.fillStyle = "#fff";
  ctx.fillText("Unser Abend", pad, y);
  y += 64;
  ctx.font = "600 38px system-ui, sans-serif";
  ctx.fillStyle = accent;
  ctx.fillText(fit(ctx, recapFacts(r), RECAP_W - 2 * pad), pad, y);

  // Höhepunkt, Zugabe, meistgespielt, Tipp
  const rows: Array<[string, string, string]> = [];
  if (r.highlights.length) rows.push(["Höhepunkt", r.highlights.join(", "), "#fcd34d"]);
  if (r.encores.length) rows.push(["Zugabe", r.encores.join(", "), "#f0abfc"]);
  if (r.topArtist) rows.push(["Meistgespielt", `${r.topArtist.name} (${r.topArtist.songs} Songs)`, "#67e8f9"]);
  y += 40;
  for (const [label, text, color] of rows) {
    y += 58;
    ctx.font = "800 34px system-ui, sans-serif";
    ctx.fillStyle = color;
    ctx.fillText(label, pad, y);
    const lw = ctx.measureText(`${label}  `).width;
    ctx.font = "500 34px system-ui, sans-serif";
    ctx.fillStyle = "#fff";
    ctx.fillText(fit(ctx, text, RECAP_W - 2 * pad - lw), pad + lw, y);
  }

  // die letzten Songs mit Cover
  y += 70;
  const size = 104;
  for (const e of r.recent.slice(0, 6)) {
    if (y + size > RECAP_H - 170) break;
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath();
    ctx.roundRect(pad, y, RECAP_W - 2 * pad, size + 24, 22);
    ctx.fill();
    const cover = e.coverUrl ? covers.get(e.coverUrl) : undefined;
    if (cover) ctx.drawImage(cover, pad + 12, y + 12, size, size);
    else {
      ctx.fillStyle = `${accent}55`;
      ctx.fillRect(pad + 12, y + 12, size, size);
    }
    const tx = pad + size + 40;
    const tw = RECAP_W - tx - pad - 20;
    ctx.font = "800 36px system-ui, sans-serif";
    ctx.fillStyle = "#fff";
    ctx.fillText(fit(ctx, `${e.liked ? "♥ " : ""}${e.title}`, tw), tx, y + 58);
    ctx.font = "500 28px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    const badge = e.phase && PHASE[e.phase] ? ` · ${PHASE[e.phase]}` : "";
    ctx.fillText(fit(ctx, `${e.artist}${badge}`, tw), tx, y + 100);
    y += size + 40;
  }

  // Fuß: Tipp und Absender
  let fy = RECAP_H - pad;
  ctx.font = "600 28px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText("Sonic Stage", pad, fy);
  if (r.tips.length) {
    fy -= 52;
    ctx.font = "600 30px system-ui, sans-serif";
    ctx.fillStyle = "#6ee7b7";
    ctx.fillText(fit(ctx, `Tipp fürs nächste Mal: ${r.tips.join(", ")}`, RECAP_W - 2 * pad), pad, fy);
  }
}
