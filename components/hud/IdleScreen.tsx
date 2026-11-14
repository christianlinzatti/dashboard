import Link from "next/link";
import type { SpotifyStatus } from "../spotify/useSpotifySync";

const loginErrors: Record<string, string> = {
  abgebrochen: "Die Anmeldung wurde abgebrochen.",
  ungueltig: "Die Anmeldung ist abgelaufen oder ungültig. Bitte noch einmal versuchen.",
  profil: "Das Spotify-Profil konnte nicht gelesen werden.",
  "nicht-freigegeben": "Dieses Spotify-Konto ist für das Dashboard nicht freigegeben.",
  token: "Spotify hat die Anmeldung abgelehnt.",
};

type Props = { status: SpotifyStatus; unknownDemo?: string; loginError?: string };

function texts(status: SpotifyStatus, unknownDemo?: string): { title: string; text: string } {
  if (unknownDemo) return { title: "Demo nicht gefunden", text: `Die Demo „${unknownDemo}“ gibt es nicht.` };
  switch (status.kind) {
    case "login":
      return { title: "Mit Spotify verbinden", text: "Melde dich einmal an – danach bleibt das Dashboard dauerhaft verbunden." };
    case "unconfigured":
      return {
        title: "Spotify ist noch nicht eingerichtet",
        text: "Auf dem Server fehlen SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET oder SESSION_SECRET.",
      };
    case "unsupported":
      return { title: "Wird nicht unterstützt", text: "Podcasts und Hörbücher werden nicht angezeigt – starte einen Song." };
    case "error":
      return { title: "Spotify nicht erreichbar", text: `${status.message} Neuer Versuch läuft …` };
    case "loading":
      return { title: "Verbinde …", text: "" };
    default:
      return {
        title: "Kein Song aktiv",
        text:
          status.kind === "idle" && status.user
            ? `Hallo ${status.user}, starte einen Song auf Spotify.`
            : "Starte einen Song auf Spotify.",
      };
  }
}

export function IdleScreen({ status, unknownDemo, loginError }: Props) {
  const { title, text } = texts(status, unknownDemo);
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-[3vmin] px-6 text-center"
      data-testid="idle"
      data-status={status.kind}
    >
      <div className="size-[14vmin] animate-pulse rounded-full bg-gradient-to-br from-fuchsia-500 to-cyan-400 opacity-80 blur-[1px]" />
      <h1 className="text-[clamp(24px,6vmin,64px)] font-bold">{title}</h1>
      {text && <p className="max-w-[60ch] text-[clamp(14px,2.6vmin,28px)] text-white/70">{text}</p>}
      {loginError && status.kind === "login" && (
        <p className="rounded-lg bg-red-500/20 px-4 py-2 text-[clamp(13px,2.2vmin,22px)] text-red-200" role="alert">
          {loginErrors[loginError] ?? "Die Anmeldung ist fehlgeschlagen."}
        </p>
      )}
      {status.kind === "login" && (
        // Normale Navigation (kein Link-Prefetch): der Server leitet zu Spotify weiter
        <a
          href="/api/auth/login"
          className="rounded-full bg-[#1ed760] px-8 py-4 text-[clamp(16px,3vmin,30px)] font-bold text-black active:scale-95"
          data-testid="login"
        >
          Mit Spotify anmelden
        </a>
      )}
      <nav className="mt-[2vmin] flex flex-wrap justify-center gap-3 text-[clamp(12px,1.9vmin,20px)] text-white/70">
        <span className="self-center">Demos:</span>
        <Link className="rounded-full bg-white/10 px-4 py-2 hover:bg-white/20" href="/?demo=neonlicht">
          Feature-Song
        </Link>
        <Link className="rounded-full bg-white/10 px-4 py-2 hover:bg-white/20" href="/?demo=abendrot">
          Zeilen-Sync
        </Link>
        <Link className="rounded-full bg-white/10 px-4 py-2 hover:bg-white/20" href="/?demo=instrumental">
          Instrumental
        </Link>
      </nav>
    </div>
  );
}
