# Sonic Stage

Lyric-Dashboard für ein 10-Zoll-Display (Raspberry Pi, Chromium im Kiosk-Modus):
zeigt den aktuellen Spotify-Song, Lyrics möglichst Wort für Wort und tanzende 3D-Avatare.

Konzept und Ausbaustufen: [`docs/KONZEPT.md`](docs/KONZEPT.md)

**Stand: Meilenstein 2** – Spotify-Anmeldung (PKCE, dauerhaft per verschlüsseltem Cookie), aktueller Song mit
ms-genau interpolierter Songzeit, Cover-Farben, Steuerleiste (Play/Pause/Skip, Lyrics-Offset).
Davor (M1): Projektgerüst, zentraler Song-Kontext, Demo-Modus, 3D-Bühne, Karaoke-Lyrics, CI/E2E/Security.
Lyrics-Provider folgen in Meilenstein 3.

## Schnellstart

```bash
npm ci
npm run dev
```

Dann im Browser öffnen:

| URL | Inhalt |
|---|---|
| `/` | Live-Betrieb mit Spotify (beim ersten Mal: „Mit Spotify anmelden“) |
| `/?demo=neonlicht` | Feature-Song, Wort-Sync, zwei Sänger (läuft in Echtzeit) |
| `/?demo=abendrot` | Ein Artist, Zeilen-Sync |
| `/?demo=instrumental` | Song ohne Lyrics |
| `…&t=46000` | Songzeit einfrieren (ms) – für reproduzierbare Screenshots |
| `…&debug=1` | Debug-Panel mit dem kompletten Song-Kontext |

Die Demo-Songs haben frei erfundene Texte.

## Skripte

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm run build` | Produktiv-Build; komprimiert vorher die Avatare (`/avatars` → `/public/avatars`) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Unit-Tests (Vitest) |
| `npm run e2e` | Playwright-Tests inkl. Screenshot-Vergleich (vorher `npm run build`) |
| `npm run e2e:update` | Referenz-Screenshots neu erzeugen |

## Architektur in Kürze

- **Song-Kontext** (`lib/song-context/`): der eine Ort mit allen Informationen zum aktuellen Song.
  Quellen (Spotify, Lyrics, Mikrofon, Wikipedia …) schreiben hinein, Anzeige- und Steuerungsmodule
  lesen nur daraus. Schema (zod), Store (Zustand), Ereignisse, Ableitungen, Demo-Fixtures.
- **Avatare** (`lib/avatars/`): Katalog aus `avatars/manifest.json`, Casting (ein Avatar pro Artist,
  genre-passend, deterministisch). Geladen werden nur die Avatare der aktuellen Besetzung.
- **Oberfläche** (`components/`): HUD, Lyrics (Karaoke-Fill), 3D-Bühne (React Three Fiber), Debug-Panel.

## Qualitätssicherung (GitHub Actions)

| Workflow | Inhalt |
|---|---|
| `ci.yml` | Lint, Typecheck, Unit-Tests, Build |
| `e2e.yml` | Playwright in Chromium (1280×800, 1024×600, 1920×1200) im offiziellen Playwright-Container, Screenshot-Vergleich gegen `playwright/screenshots/`, Bericht als Artefakt |
| `update-screenshots.yml` | manuell: Referenz-Screenshots im Container neu erzeugen und auf den Branch committen |
| `codeql.yml` | CodeQL-Sicherheitsanalyse |
| `security.yml` | `npm audit`, Gitleaks-Secret-Scan, Dependency Review |
| `dependabot.yml` | wöchentliche Updates für npm und Actions |

Alle Actions sind auf Commit-SHAs gepinnt. Die `@playwright/test`-Version muss zum Container-Image
in `e2e.yml` passen und wird deshalb gemeinsam von Hand aktualisiert.

## Hosting auf Vercel

1. In Vercel **Add New → Project** und dieses GitHub-Repository importieren (Framework: Next.js, Standard-Einstellungen).
2. `main` wird zu Production, jeder Branch/PR bekommt eine Preview-URL.
3. Umgebungsvariablen setzen (Settings → Environment Variables), siehe `.env.example`.

## Spotify einrichten

1. Im [Spotify-Developer-Dashboard](https://developer.spotify.com/dashboard) die App öffnen → **Settings**.
2. Unter **Redirect URIs** eintragen (exakt, ohne Schrägstrich am Ende):
   - `https://<dein-projekt>.vercel.app/api/auth/callback` (Production)
   - `http://127.0.0.1:3000/api/auth/callback` (lokal; Spotify akzeptiert kein `localhost`)
3. In Vercel setzen:
   - `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` (aus der App)
   - `SESSION_SECRET` – zufällig, mind. 32 Zeichen, z. B. `openssl rand -base64 48`
   - `ALLOWED_SPOTIFY_USERS` – deine Spotify-User-ID (schützt das Dashboard vor fremden Konten)
   - optional `SPOTIFY_REDIRECT_URI`, falls Preview-URLs auf die Production-Callback-URL zeigen sollen
4. Dashboard öffnen → **Mit Spotify anmelden**. Die Anmeldung bleibt ein Jahr gültig (Refresh-Token im verschlüsselten Cookie).

Hinweis: Seit Februar 2026 schränkt Spotify Apps im Entwicklungsmodus ein. Pflicht für das Dashboard ist nur
„aktuell gespielter Song“. Lehnt Spotify die Player-Steuerung ab (403), zeigt die Steuerleiste das an – alles andere läuft weiter.
