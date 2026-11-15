# Sonic Stage

Lyric-Dashboard für ein 10-Zoll-Display (Raspberry Pi, Chromium im Kiosk-Modus):
zeigt den aktuellen Spotify-Song, Lyrics möglichst Wort für Wort und tanzende 3D-Avatare.

Konzept und Ausbaustufen: [`docs/KONZEPT.md`](docs/KONZEPT.md) · Architektur-Bewertung: [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md)

**Neu: Bühne** – Das Band-Logo (TheAudioDB) leuchtet in Intro, Outro und Instrumentalteilen über der LED-Wand;
Avatare von Künstlern, denen du folgst, winken zum Songstart.

**Neu: Betrieb** – Fehler und alle 5 min eine Leistungsprobe (Bildrate, Qualitätsstufe) landen im Kiosk-Protokoll
(Debug-Panel `?debug=1`). Ein Watchdog in der Pi-Bridge startet den Kiosk neu, wenn das Dashboard hängt
(`bridge/README.md`). Burn-in-Schutz: Kopfzeile und Fortschritt wandern unmerklich, der Startbildschirm dunkelt nach 10 min
ab. Avatar-Dateien tragen eine Version, damit Updates trotz Jahres-Cache ankommen.

**Neu: Tempo-Startwert** – Zu jedem Song mit ISRC holt das Dashboard das Tempo von Deezer (öffentliche API, ohne Key,
180 Tage gecacht). Avatare und Licht tanzen damit vom ersten Takt an im richtigen Tempo, auch ohne Mikrofon. Mit Mikrofon
korrigiert der Startwert Oktavfehler (halbes/doppeltes Tempo).

**Neu: Song merken** – Herz in der Kopfzeile antippen speichert den Song in den Spotify-Lieblingssongs („♡ Merken“)
oder entfernt ihn wieder; per Alexa: „merk dir den Song“. Braucht die Berechtigung `user-library-modify`:
**nach dem Update einmal abmelden und neu anmelden.**

**Neu: Umschrift und Übersetzung** – Liefert Better Lyrics eine Umschrift (z. B. Japanisch → Rōmaji, Koreanisch →
lateinisch) oder eine Übersetzung, erscheint sie als zweite Zeile unter dem Liedtext. Die Umschrift wird mit eigenem
Timing mitgefüllt. Die Einstellung „automatisch“ zeigt die Umschrift bei nicht-lateinischer Schrift und Übersetzungen nur,
wenn sie deutsch sind; der Schalter „2. Zeile“ in der Steuerleiste wechselt zu Umschrift, Übersetzung (jede Sprache)
oder aus. Demo: `/?demo=hoshizora`.

**Stand: Stufe 5c** – Mehr Bilder und Trivia:
- **TheAudioDB** (ohne eigenen Key nutzbar): Bühnenbilder im 16:9-Format für die LED-Wand, Band-Logos auf der
  Infokarte, deutsche Biografie als Ersatz, wenn es keinen Wikipedia-Artikel gibt, sowie Stil, Mitgliederzahl und Herkunft.
- **Flickr** (`FLICKR_API_KEY`): Konzertfotos aller Lizenzen, immer mit Fotograf und Lizenz (auch „Alle Rechte
  vorbehalten“). Das passt für ein privates Dashboard, für eine öffentliche Seite bitte wieder auf freie Lizenzen beschränken.
- **Genius** (`GENIUS_ACCESS_TOKEN`): Song-Trivia im Fakten-Ticker (Produzenten, Songwriter, Samples).
  Songtexte liefert die Genius-API nicht.
- **Fotoauswahl:** Die Wand bekommt Querformat und Bühnenbilder und wechselt das Foto mit jedem Abschnitt. Die Karte
  bekommt Porträts. Bilder von TheAudioDB und Flickr laufen über den Next.js-Bildoptimierer (eigene Domain, kleiner
  für den Pi).

Stufe 5b – Konzerte: In den letzten 15 Sekunden eines Songs zeigt eine **Konzertkarte** die nächsten
Termine der Artists. Termine im Umkreis von Wien (`CONCERT_RADIUS_KM`, Standard 200 km) stehen zuerst. Die Karte
zeigt Countdown („in 21 Tagen“), **ausverkauft** und einen **QR-Code zum Ticket**. Dazu kommt „Zuletzt live …
– dieser Song war dabei“ aus setlist.fm. Quellen sind **oeticket** (inoffizielle Eventim-Suche, ohne Key; `OETICKET=0`
schaltet ab), Ticketmaster (`TICKETMASTER_API_KEY`) und Bandsintown (`BANDSINTOWN_APP_ID`). Ticket-Links kommen
bevorzugt von oeticket. Gezählt wird ein Termin nur, wenn der Künstler wirklich auftritt; Tribute-Shows und
unscharfe Suchtreffer fallen weg. Doppelte Termine werden zusammengeführt, die Daten 12 Stunden gecacht. setlist.fm braucht
`SETLISTFM_API_KEY`. Ohne Schlüssel bleibt die Karte einfach weg. Orte ohne Koordinaten werden über
OpenStreetMap (Nominatim, höchstens 1 Anfrage/s, 1 Jahr gecacht) verortet; `CONCERT_GEOCODING=0` schaltet das ab.

Stufe 5a – Persönliches: **zuletzt gehört** (Last.fm, sonst Spotify) auf dem Startbildschirm,
**Lieblingssong** (Spotify), **auf Last.fm geliebt**, **„37× gehört“**, **★ bei Künstlern, denen du folgst**
(Kopfzeile und Namensschilder). Last.fm braucht `LASTFM_API_KEY` und `LASTFM_USER`.

Stufe 4 – Band-Infos & Fotos: MusicBrainz → Wikidata → Wikipedia (de, sonst en) und frei
lizenzierte Fotos von Wikimedia Commons (mit Urheber und Lizenz). **Infokarte** in Intro, Outro, Instrumentalteilen
und langen Pausen (bei Feature-Songs abwechselnd), **Fakten-Ticker** in Strophen, **Band-Foto als Duoton auf der
LED-Wand**. Abfragen gedrosselt (MusicBrainz 1/s) und 7 Tage gecacht.

Stufe 3 – Govee & Alexa:
- **Pi-Bridge** (`bridge/`, Anleitung in `bridge/README.md`): steuert die Govee-Lampen per LAN-API im Takt
  des LightDirectors (Rollen puls/akzent/grund), WebSocket nur lokal und nur für das eigene Dashboard.
- **Alexa-Skill** (`alexa/README.md`): „Welcher Song läuft?“, „Wer singt?“, Lampen/Strobo/Qualität per Sprache;
  jede Anfrage wird nach Amazons Vorgaben geprüft.
- **Serverseitiger Song-Kontext:** Das Dashboard meldet seinen Stand an `/api/song-context` und holt dabei
  Befehle ab (z. B. von Alexa).

M8 – Bühne & Licht (Ausbaustufe 2): Podest, Traverse, LED-Rückwand (Farbverlauf,
Equalizer aus den Mikro-Frequenzbändern, Gegenlicht), Moving Heads mit Lichtkegeln, Laser-Fächer, Bodennebel,
Bloom und Strobe bei Drops. Der **LightDirector** (`lib/stage/lights.ts`) wählt die Szene je Abschnitt,
bewegt die Scheinwerfer im Beat-Raster und wechselt Farben auf Taktanfang; er liefert auch ein
geräteunabhängiges Lichtsignal für die Govee-Lampen (Stufe 3). Qualitätsstufen niedrig/mittel/hoch
(Pi 4 / Pi 5 / Mini-PC), „Auto“ passt sich der Bildrate an; Qualität und Strobe in der Steuerleiste.

M6 – Wort-für-Wort-Lyrics und wechselnde Darstellungen:
- Provider (gegen echte Schnittstellen geprüft, Nov. 2026): **Better Lyrics** (`lyrics-api.boidu.dev`,
  Apple-Music-TTML mit Wort- und Silben-Timing, echten Songabschnitten und Sängern bei Duetten; ohne
  `BETTER_LYRICS_API_KEY` nur Songs aus dem Cache des Dienstes), **NetEase** (Wort-Sync, YRC), **LRCLIB**,
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

## Cache (Upstash Redis)

Lyrics, Band-Infos und der Dashboard-Stand für Alexa werden serverseitig gecacht. Ohne Redis nur im
Arbeitsspeicher einzelner, kurzlebiger Server-Instanzen. Deshalb **Upstash Redis verbinden**:

1. Vercel → Projekt → **Storage** → **Create** → **Upstash for Redis** (kostenloser Tarif) → mit dem Projekt verbinden.
2. Vercel setzt `KV_REST_API_URL`/`KV_REST_API_TOKEN` (bzw. `UPSTASH_REDIS_REST_URL`/`_TOKEN`) automatisch.
3. Neu deployen. Fertig, am Code ist nichts anzupassen.

| Daten | Haltedauer |
|---|---|
| Lyrics (gefunden / nicht gefunden) | 180 Tage / 3 Tage |
| Band-Infos und Fotos (gefunden / nicht gefunden) | 30 Tage / 3 Tage |
| Konzerttermine (alle Quellen / eine Quelle ausgefallen) / letzte Setlist | 12 Stunden / 30 Minuten / 3 Tage |
| Dashboard-Stand für Alexa (persönlich) | 2 Stunden |
| Befehle (z. B. von Alexa) | 5 Minuten |

Alle Werte stehen in `lib/cache-policy.ts`.
- Fehlschläge (Drosselung, Timeouts) werden nie gecacht.
- Einträge ab 1 KB werden komprimiert gespeichert: Lyrics mit Wort-Timings ~30 KB → ~8 KB.
- Das Dashboard meldet seinen Stand beim Abspielen alle 15 s, sonst jede Minute (Song-/Abschnittswechsel sofort).
  So bleibt es auch im Dauerbetrieb deutlich unter dem kostenlosen Kontingent von 500 000 Befehlen/Monat.

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
- **Schriften für Japanisch/Chinesisch/Koreanisch** (Liedtexte mit Umschrift), sonst erscheinen Kästchen:

  ```bash
  sudo apt install fonts-noto-cjk
  ```
