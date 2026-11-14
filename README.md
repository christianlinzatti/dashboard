# Sonic Stage

Lyric-Dashboard für ein 10-Zoll-Display (Raspberry Pi, Chromium im Kiosk-Modus):
zeigt den aktuellen Spotify-Song, Lyrics möglichst Wort für Wort und tanzende 3D-Avatare.

Konzept und Ausbaustufen: [`docs/KONZEPT.md`](docs/KONZEPT.md)

**Stand: Meilenstein 1** – Projektgerüst, zentraler Song-Kontext, Demo-Modus, 3D-Bühne mit den Avataren
der aktuellen Besetzung, Karaoke-Lyrics, CI/E2E/Security-Workflows. Spotify-Anmeldung folgt in Meilenstein 2.

## Schnellstart

```bash
npm ci
npm run dev
```

Dann im Browser öffnen:

| URL | Inhalt |
|---|---|
| `/` | Startbildschirm (noch ohne Spotify) |
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
3. Umgebungsvariablen nach `.env.example` setzen (werden ab Meilenstein 2 gebraucht).
