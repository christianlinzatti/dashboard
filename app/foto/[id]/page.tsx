import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PHOTO_ID } from "@/lib/server/photo-store";

export const metadata: Metadata = { title: "Erinnerungsfoto · Sonic Stage", robots: { index: false } };

/** Erinnerungsfoto auf dem Handy: Bild und Speichern-Knopf (24 h abrufbar) */
export default async function PhotoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!PHOTO_ID.test(id)) notFound();
  const src = `/api/photo/${id}`;
  return (
    <main className="flex min-h-dvh flex-col items-center gap-4 bg-[#05030a] p-4 text-white">
      <h1 className="text-lg font-bold">Erinnerungsfoto</h1>
      {/* eslint-disable-next-line @next/next/no-img-element -- Foto aus dem eigenen Speicher, keine Bildoptimierung nötig */}
      <img src={src} alt="Bühne mit Songzeile" className="w-full max-w-3xl rounded-xl shadow-2xl" data-testid="photo" />
      <a
        href={src}
        download={`sonic-stage-${id.slice(0, 6)}.jpg`}
        className="rounded-full bg-fuchsia-600 px-6 py-3 font-bold"
        data-testid="photo-download"
      >
        Foto speichern
      </a>
      <p className="text-sm text-white/60">Bleibt 24 Stunden abrufbar.</p>
    </main>
  );
}
