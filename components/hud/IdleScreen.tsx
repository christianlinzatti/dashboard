import Link from "next/link";

export function IdleScreen({ unknownDemo }: { unknownDemo?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[3vmin] px-6 text-center" data-testid="idle">
      <div className="size-[14vmin] animate-pulse rounded-full bg-gradient-to-br from-fuchsia-500 to-cyan-400 opacity-80 blur-[1px]" />
      <h1 className="text-[clamp(24px,6vmin,64px)] font-bold">Kein Song aktiv</h1>
      <p className="max-w-[60ch] text-[clamp(14px,2.6vmin,28px)] text-white/70">
        {unknownDemo
          ? `Die Demo „${unknownDemo}“ gibt es nicht.`
          : "Starte einen Song auf Spotify. Die Spotify-Anmeldung folgt in Meilenstein 2."}
      </p>
      <nav className="flex flex-wrap justify-center gap-3 text-[clamp(13px,2.2vmin,22px)]">
        <Link className="rounded-full bg-white/10 px-5 py-3 hover:bg-white/20" href="/?demo=neonlicht">
          Demo: Feature-Song
        </Link>
        <Link className="rounded-full bg-white/10 px-5 py-3 hover:bg-white/20" href="/?demo=abendrot">
          Demo: Zeilen-Sync
        </Link>
        <Link className="rounded-full bg-white/10 px-5 py-3 hover:bg-white/20" href="/?demo=instrumental">
          Demo: Instrumental
        </Link>
      </nav>
    </div>
  );
}
