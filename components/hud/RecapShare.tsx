"use client";

import { useState } from "react";
import { QrCode } from "@/components/concerts/QrCode";
import { displayUrl } from "@/lib/info/photos";
import { photoDate } from "@/lib/photo/compose";
import type { Recap } from "@/lib/show/recap";
import { drawRecap, RECAP_H, RECAP_W } from "@/lib/show/recap-image";

/** Cover laden – nur von der eigenen Adresse (Bild-Proxy), fremde Bilder sperren den Export */
async function loadCovers(recap: Recap) {
  const covers = new Map<string, HTMLImageElement>();
  await Promise.all(
    recap.recent.slice(0, 6).map(async (e) => {
      if (!e.coverUrl) return;
      const src = displayUrl(e.coverUrl, 128);
      if (!src.startsWith("/")) return;
      const img = new Image();
      img.src = src;
      try {
        await img.decode();
        covers.set(e.coverUrl, img);
      } catch {
        /* ohne Cover */
      }
    }),
  );
  return covers;
}

type State = { kind: "aus" } | { kind: "laden" } | { kind: "fertig"; url: string } | { kind: "fehler"; text: string };

/** „Rückblick aufs Handy“: Rückblick als Bild (Hochformat) hochladen und per QR-Code teilen */
export function RecapShare({ recap }: { recap: Recap }) {
  const [state, setState] = useState<State>({ kind: "aus" });
  const share = async () => {
    setState({ kind: "laden" });
    try {
      const c = document.createElement("canvas");
      c.width = RECAP_W;
      c.height = RECAP_H;
      drawRecap(c.getContext("2d")!, recap, await loadCovers(recap), { date: photoDate(recap.since) });
      const blob = await new Promise<Blob>((res, rej) =>
        c.toBlob((b) => (b ? res(b) : rej(new Error("JPEG"))), "image/jpeg", 0.86),
      );
      const r = await fetch("/api/photo", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob });
      if (!r.ok) throw new Error(r.status === 401 ? "Nur angemeldet möglich" : `Hochladen fehlgeschlagen (${r.status})`);
      const { id } = (await r.json()) as { id: string };
      setState({ kind: "fertig", url: `${window.location.origin}/foto/${id}` });
    } catch (e) {
      setState({ kind: "fehler", text: e instanceof Error ? e.message : "Fehlgeschlagen" });
    }
  };
  if (state.kind === "fertig")
    return (
      <div className="mt-[1.5vmin] flex items-center gap-[2vmin]" data-testid="recap-share" data-url={state.url}>
        <QrCode text={state.url} size="14vmin" label="QR-Code zum Rückblick" />
        <p className="text-[clamp(12px,2vmin,20px)] text-white/80">Scannen – der Rückblick als Bild, 24 Stunden abrufbar.</p>
      </div>
    );
  return (
    <div className="mt-[1.5vmin] flex items-center gap-[2vmin]">
      <button
        type="button"
        onClick={() => void share()}
        disabled={state.kind === "laden"}
        className="rounded-full bg-white/15 px-[2.4vmin] py-[1vmin] text-[clamp(12px,2vmin,20px)] font-semibold hover:bg-white/25 disabled:opacity-60"
        data-testid="recap-share-button"
      >
        {state.kind === "laden" ? "Einen Moment …" : "📱 Rückblick aufs Handy"}
      </button>
      {state.kind === "fehler" && (
        <span className="text-[clamp(11px,1.8vmin,18px)] text-red-300" data-testid="recap-share-error">
          {state.text}
        </span>
      )}
    </div>
  );
}
