import { photoStore } from "@/lib/server/photo-store";

export const dynamic = "force-dynamic";

/** Erinnerungsfoto ausliefern (ohne Anmeldung: wer den QR-Code scannt, hat die nicht erratbare Adresse) */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bytes = await photoStore().get(id);
  if (!bytes) return new Response("Foto nicht (mehr) da.", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=86400",
      "Content-Disposition": `inline; filename="sonic-stage-${id.slice(0, 6)}.jpg"`,
    },
  });
}
