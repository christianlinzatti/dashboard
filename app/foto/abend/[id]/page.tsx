import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GalleryPhoto } from "@/components/photo/GalleryPhoto";
import { PHOTO_ID, photoStore } from "@/lib/server/photo-store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fotos des Abends · Sonic Stage", robots: { index: false } };

/** Alle Erinnerungsfotos eines Abends auf dem Handy (24 h abrufbar), jedes einzeln speicherbar */
export default async function GalleryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!PHOTO_ID.test(id)) notFound();
  const ids = await photoStore().getGallery(id);
  if (!ids) notFound();
  return (
    <main className="flex min-h-dvh flex-col items-center gap-4 bg-[#05030a] p-4 text-white">
      <h1 className="text-lg font-bold">Fotos des Abends ({ids.length})</h1>
      <ul className="grid w-full max-w-3xl gap-4" data-testid="gallery">
        {ids.map((p, i) => (
          <GalleryPhoto key={p} id={p} n={i + 1} />
        ))}
      </ul>
      <p className="text-sm text-white/60">Bleibt 24 Stunden ab dem jeweiligen Foto abrufbar.</p>
    </main>
  );
}
