"use client";

/* eslint-disable @next/next/no-img-element -- kleine, lokale Vorschaubilder */
import { chibiIds, type AvatarStyle } from "@/lib/avatars/overrides";

const OPTIONS: Array<{ id: AvatarStyle; label: string; hint: string }> = [
  { id: "gemischt", label: "Gemischt", hint: "alle Figuren, passend zum Genre" },
  { id: "chibi", label: "Nur Chibis", hint: "großer Kopf, große Augen – auf der ganzen Bühne" },
];

/** Avatar-Stil für alle Figuren auf der Bühne (gilt auf allen Geräten ab dem nächsten Song) */
export function AvatarStyleSection({
  value,
  busy,
  save,
}: {
  value: AvatarStyle;
  busy: boolean;
  save: (patch: { avatarStyle: AvatarStyle }, done: string) => void;
}) {
  const preview = chibiIds().slice(0, 5);
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-white/5 p-5" aria-labelledby="avatar-stil" data-testid="avatar-style">
      <h2 id="avatar-stil" className="text-xl font-bold">
        Avatar-Stil
      </h2>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Avatar-Stil">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            disabled={busy}
            className={`flex min-h-12 flex-col items-start rounded-2xl px-5 py-2 text-left disabled:opacity-50 ${
              value === o.id ? "bg-white text-black" : "bg-white/10 text-white"
            }`}
            onClick={() =>
              value !== o.id &&
              save(
                { avatarStyle: o.id },
                o.id === "chibi" ? "Ab dem nächsten Song tanzen Chibis." : "Ab dem nächsten Song wieder alle Figuren.",
              )
            }
            data-testid={`avatar-style-${o.id}`}
          >
            <span className="text-lg font-semibold">{o.label}</span>
            <span className={`text-sm ${value === o.id ? "text-black/60" : "text-white/60"}`}>{o.hint}</span>
          </button>
        ))}
      </div>
      <div className="flex gap-1" aria-hidden>
        {preview.map((id) => (
          <img key={id} src={`/avatars/${id}.png`} alt="" className="size-14 rounded-lg bg-black/40 object-cover" />
        ))}
      </div>
      <p className="text-sm text-white/50">Eigene Avatare für einzelne Künstler (unten) gelten weiterhin.</p>
    </section>
  );
}
