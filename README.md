# Sonic Stage

Lyric-Dashboard für ein 10-Zoll-Display (Raspberry Pi, Chromium im Kiosk-Modus):
zeigt den aktuellen Spotify-Song, Lyrics möglichst Wort für Wort und tanzende 3D-Avatare.

Konzept und Ausbaustufen: [`docs/KONZEPT.md`](docs/KONZEPT.md) · Architektur-Bewertung: [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md)

**Stand: Meilenstein 8** – Bühne & Licht (Ausbaustufe 2): Podest, Traverse, LED-Rückwand (Farbverlauf,
Equalizer aus den Mikro-Frequenzbändern, Gegenlicht), Moving Heads mit Lichtkegeln, Laser-Fächer, Bodennebel,
Bloom und Strobe bei Drops. Der **LightDirector** (`lib/stage/lights.ts`) wählt die Szene je Abschnitt,
bewegt die Scheinwerfer im Beat-Raster und wechselt Farben auf Taktanfang; er liefert auch ein
geräteunabhängiges Lichtsignal für die Govee-Lampen (Stufe 3). Qualitätsstufen niedrig/mittel/hoch
(Pi 4 / Pi 5 / Mini-PC), „Auto“ passt sich der Bildrate an; Qualität und Strobe in der Steuerleiste.

M6 – Wort-für-Wort-Lyrics und wechselnde Darstellungen:
- Provider (gegen echte Schnittstellen geprüft, Nov. 2026): **NetEase** (Wort-Sync, YRC), **LRCLIB**,
  **Musixmatch Desktop** (Zeilen-Sync; liefert aus Rechenzentren Lockvogel-Treffer, die verworfen werden),
  **Spotify Color-Lyrics** (nur mit `SPOTIFY_SP_DC` + TOTP-Secret, nicht ohne Zugangsdaten testbar).
  Jeder Treffer wird gegen Titel, Artist, Version und Dauer geprüft.
- **LyricsDirector** wählt pro Abschnitt: Karaoke, Wort-Pop, Stapel, Schreibmaschine, Duett (Feature-Songs);
  Refrains abwechselnd auffällig, schnelle Parts als Wort-Pop, Background-Vocals in Klammern kleiner/kursiv.
  Erzwingen per `?lyrics=<modus>`.

M5 – Mikrofon-Analyse (nur lokal im Browser): Tempo per Autokorrelation mit
Einrasten pro Song, Beat-Tracking mit Phasenregelung, Tanz am gemessenen Beat-Raster, Energie (automatische
Pegelanpassung), Frequenzbänder, Stimmaktivität für die LED-Gesichter, Drop-Erkennung (zwei Takte
Höhepunkt-Tanz), Licht pulsiert im Takt. Mikro-Schalter in der Steuerleiste, roter Punkt = Mikro aktiv.

M4 – Tanz-Regie: Choreografie-Plan pro Song (Phrasen von 8/16 Takten, Energie je
Abschnitt, Refrains synchron, Strophen mit Varianten und Kanon, Wiederholungssperre, Genre-Vorlieben),
Formationen, Kamerafahrten, aktiver Sänger tritt ins Spotlight, Namensschilder bei Feature-Songs.

M3 – Lyrics: Provider-Kette (LRCLIB + eigene Korrekturen in `data/lyrics/`),
LRC/Enhanced-LRC-Parser, Wort-Schätzung bei Zeilen-Sync, automatische Strophen-/Refrain-Erkennung, Cache
(Upstash Redis oder Speicher), täglicher Live-Check der Provider.
Davor: M2 Spotify-Anmeldung, aktueller Song, Cover-Farben, Steuerleiste · M1 Projektgerüst, Song-Kontext,
Demo-Modus, 3D-Bühne, CI/E2E/Security. Weitere (inoffizielle) Wort-für-Wort-Provider folgen in Meilenstein 6.

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
| `…&lyrics=stapel` | Darstellung erzwingen (`karaoke`, `wortpop`, `stapel`, `schreibmaschine`, `duett`) |
| `…&qualitaet=hoch` | Qualitätsstufe der Bühne erzwingen (`niedrig`, `mittel`, `hoch`) |
| `…&mic=1` | Mikrofon-Analyse auch in der Demo (sonst nur im Live-Betrieb) |

Die Demo-Songs haben frei erfundene Texte.

## Skripte

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm run build` | Produktiv-Build; komprimiert vorher die Avatare (`/avatars` → `/public/avatars`) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Unit-Tests (Vitest); mit `npx vitest run --coverage` inkl. Abdeckung und Mindestwerten |
| `npm run format` / `npm run format:check` | Prettier formatieren / prüfen |
| `npm run e2e` | Playwright-Tests inkl. Screenshot-Vergleich (vorher `npm run build`) |
| `npm run e2e:update` | Referenz-Screenshots neu erzeugen |
| `npm run test:live` | echte Lyrics-Provider prüfen (Netzwerk) |

## Architektur in Kürze

- **Song-Kontext** (`lib/song-context/`): der eine Ort mit allen Informationen zum aktuellen Song.
  Quellen (Spotify, Lyrics, Mikrofon, Wikipedia …) schreiben hinein, Anzeige- und Steuerungsmodule
  lesen nur daraus. Schema (zod), Store (Zustand), Ereignisse, Ableitungen, Demo-Fixtures.
- **Avatare** (`lib/avatars/`): Katalog aus `avatars/manifest.json`, Casting (ein Avatar pro Artist,
  genre-passend, deterministisch). Geladen werden nur die Avatare der aktuellen Besetzung.
- **Tanz** (`lib/dance/`): `planChoreography()` plant den ganzen Song deterministisch (Seed = Track),
  `layersAt()/positionsAt()/cameraAt()` werten den Plan zur Songzeit aus – gleiche Songzeit, gleiche Pose.
- **Audio** (`lib/audio/`): Spektrum-Features, Tempo-Schätzung, Beat-Tracker, Energie/Drops, Tempo-Einrasten
  (alles reine Funktionen, mit synthetischen Signalen getestet); `mic.ts` verbindet Web Audio damit.
- **Lyrics** (`lib/lyrics/`): Provider-Interface, parallele Abfrage mit Timeout und Circuit-Breaker,
  Ranking (eigene > Wort-Sync > Zeilen-Sync > Text), Parser, Abschnitts-Erkennung, Cache. Route `/api/lyrics`.
- **Oberfläche** (`components/`): HUD, Lyrics (Karaoke-Fill), 3D-Bühne (React Three Fiber), Debug-Panel.

## Qualitätssicherung (GitHub Actions)

| Workflow | Inhalt |
|---|---|
| `ci.yml` | Prettier, Lint, Typecheck, Unit-Tests mit Mindest-Abdeckung, Build (mit Cache) |
| `e2e.yml` | Playwright in Chromium, je Auflösung ein paralleler Job (1280×800, 1024×600, 1920×1200) im offiziellen Playwright-Container, Screenshot-Vergleich gegen `playwright/screenshots/`, Bericht als Artefakt |
| `update-screenshots.yml` | manuell: Referenz-Screenshots im Container neu erzeugen, auf den Branch committen und danach E2E starten |
| `workflows-lint.yml` | `actionlint` prüft die Workflows bei Änderungen |
| `codeql.yml` | CodeQL-Sicherheitsanalyse |
| `security.yml` | `npm audit`, Gitleaks-Secret-Scan, Dependency Review |
| `provider-check.yml` | täglich: echte Lyrics-Provider prüfen, bei Ausfall Issue anlegen |
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

## Raspberry Pi (Kiosk)

Chromium im Kiosk-Modus, z. B. per Autostart (labwc/Wayfire) oder systemd-User-Service:

```bash
chromium --kiosk --noerrdialogs --disable-infobars \
  --ignore-gpu-blocklist --enable-gpu-rasterization \
  --autoplay-policy=no-user-gesture-required \
  https://<dein-projekt>.vercel.app
```

- **Mikrofon:** USB-Mikrofon anschließen, beim ersten Start die Freigabe erlauben (wird für die Domain
  gespeichert). Danach startet die Analyse automatisch. Audio wird nur lokal im Browser ausgewertet.
- `--autoplay-policy=no-user-gesture-required` sorgt dafür, dass die Audio-Analyse ohne Antippen startet.
