"use client";

import { useEffect, useState } from "react";
import { QrCode } from "@/components/concerts/QrCode";
import { currentEvening, loadEveningPhotos } from "@/lib/photo/evening";

type State = { kind: "aus" } | { kind: "laden" } | { kind: "fertig"; url: string } | { kind: "fehler"; text: string };

/** „Alle Fotos des Abends“: Galerie aus den Erinnerungsfotos anlegen und per QR-Code teilen (ab zwei Fotos) */
export function GalleryShare() {
  const [ids, setIds] = useState<string[]>([]);
  const [state, setState] = useState<State>({ kind: "aus" });
  useEffect(() => {
    const t = setTimeout(() => setIds(currentEvening(loadEveningPhotos(), Date.now()).map((p) => p.id)), 0);
    return () => clearTimeout(t);
  }, []);
  if (ids.length < 2) return null;
  const share = async () => {
    setState({ kind: "laden" });
    try {
      const r = await fetch("/api/photo/galerie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!r.ok) throw new Error(r.status === 401 ? "Nur angemeldet möglich" : `Fehlgeschlagen (${r.status})`);
      const { id } = (await r.json()) as { id: string };
      setState({ kind: "fertig", url: `${window.location.origin}/foto/abend/${id}` });
    } catch (e) {
      setState({ kind: "fehler", text: e instanceof Error ? e.message : "Fehlgeschlagen" });
    }
  };
  if (state.kind === "fertig")
    return (
      <div className="flex items-center gap-[2vmin]" data-testid="gallery-share" data-url={state.url}>
        <QrCode text={state.url} size="14vmin" label="QR-Code zu den Fotos des Abends" />
        <p className="text-[clamp(12px,2vmin,20px)] text-white/80">Scannen – alle {ids.length} Fotos des Abends.</p>
      </div>
    );
  return (
    <div className="flex items-center gap-[2vmin]">
      <button
        type="button"
        onClick={() => void share()}
        disabled={state.kind === "laden"}
        className="rounded-full bg-white/15 px-[2.4vmin] py-[1vmin] text-[clamp(12px,2vmin,20px)] font-semibold hover:bg-white/25 disabled:opacity-60"
        data-testid="gallery-share-button"
      >
        {state.kind === "laden" ? "Einen Moment …" : `📷 Alle ${ids.length} Fotos des Abends`}
      </button>
      {state.kind === "fehler" && <span className="text-[clamp(11px,1.8vmin,18px)] text-red-300">{state.text}</span>}
    </div>
  );
}
