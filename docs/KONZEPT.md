# Konzept: „Sonic Stage“ – Lyric-Dashboard (10 Zoll)

Stand: 2026-11-15 · Status: **v3 – Ist-Stand nach Stufe 5 und Ausblick**

v1/v2 waren der Plan vor der Umsetzung. v3 beschreibt, was tatsächlich gebaut ist, wo und warum wir vom Plan
abgewichen sind, was noch fehlt und welche Ausbaustufen als Nächstes sinnvoll sind. Die technische Bewertung der
Codebasis steht in [`ARCHITEKTUR.md`](ARCHITEKTUR.md).

Legende: ✅ umgesetzt · ◐ teilweise · ○ offen

---

## 0. Überblick

| Stufe | Inhalt | Stand |
|---|---|---|
| 1 | Spotify-Song, Lyrics Wort für Wort aus mehreren Quellen, tanzende 3D-Avatare, Mikrofon-Analyse, Vercel, GitHub Actions, Playwright-Screenshots | ✅ |
| 2 | Bühne mit Licht: Moving Heads, Laser, Nebel, LED-Wand, Bloom, Qualitätsstufen | ✅ |
| 3 | Govee-Lampen per LAN über die Pi-Bridge, Alexa-Skill | ✅ (ohne Smart-Home-Gerät) |
| 4 | Band-Infos und Fotos (MusicBrainz, Wikidata, Wikipedia, Commons), Infokarte, Fakten-Ticker | ✅ |
| 5a | Last.fm-Verlauf, Hörstatistik, Lieblingssong, Follows | ✅ |
| 5b | Konzerte: oeticket, Ticketmaster, Bandsintown, setlist.fm; Konzertkarte mit QR-Code | ✅ |
| 5c | TheAudioDB, Flickr, Genius-Trivia, Fotoauswahl | ✅ |
| extra | Better Lyrics (Apple-TTML, Silben-Timing, echte Songabschnitte, Duette), Umschrift/Übersetzung | ✅ |
| extra | Alexa kennt Konzerte, Hörstatistik, Likes, Band-Infos, Erscheinungsjahr | ✅ |

**Festgelegt:** Raspberry Pi (noch nicht gekauft) mit Chromium im Kiosk-Modus · Spotify-Developer-App und Premium ·
kein Apple-Developer-Zugang · inoffizielle Quellen erwünscht · Oberfläche **ausschließlich Deutsch** ·
Heimatort Wien, Konzert-Umkreis 200 km · Govee H6063, H610B, H61A2, H6051 (alle LAN) · Last.fm-Profil (Spotify scrobbelt).

---

## 1. Ziel

Eine Web-App (Next.js/React) im Vollbild auf einem 10-Zoll-Display, die

1. den **aktuell auf Spotify laufenden Song** zeigt (Cover, Titel, Artists, Fortschritt),
2. die **Lyrics synchron, möglichst Wort für Wort**, in wechselnden Darstellungen einblendet,
3. **3D-Avatare** passend zum Song **tanzen** lässt, bei Feature-Songs mit mehreren Tänzern,
4. den Song **live über das Mikrofon analysiert** (Tempo, Beat, Energie, Drops),
5. eine **Bühne mit Licht** zeigt und **echte Lampen** im Raum mitsteuert,
6. **Infos, Fotos, Persönliches und Konzerte** zum Song einblendet, ohne die Lyrics zu verdrängen,
7. per **Alexa** abfragbar und steuerbar ist.

---

## 2. Avatare (`/avatars`)

| Eigenschaft | Wert |
|---|---|
| Anzahl | 11 (`atlas-prism`, `aurora-synth`, `chrome-beat`, `ember-rock`, `festival-nova`, `luna-flow`, `neon-pulse`, `quantum-bass`, `rio-carnival`, `sol-groove`, `velvet-jazz`), Lizenz CC0 |
| Format | GLB, humanoides Skelett (Mixamo-Namen), 13–16k Dreiecke, keine Texturen |
| Besonderheit | **LED-Gesichts-Bones** (`FaceLedEye*`, `FaceLedBar0–4`) – leuchten mit Stimme und Beat ✅ |
| Clips | 22–32 je Avatar, 20 gemeinsame (`Idle_Breathe`, `Gesture_Wave`, `Dance_*`) |
| Größe | 44 MB → **17 MB** nach Meshopt-Kompression (`scripts/optimize-avatars.mjs`, läuft vor jedem Build) ✅ |

Geladen werden nur die Avatare der aktuellen Besetzung. Ein Artist bekommt über einen stabilen Hash immer denselben
Avatar, bevorzugt einen, der zum Genre passt (`lib/avatars/casting.ts`).

---

## 3. Zielgerät & UX

**Hardware-Empfehlung** (unverändert): **Raspberry Pi 5, 8 GB** mit aktivem Kühler, NVMe-SSD, 10,1"-Display
**1280×800** (Referenzformat). Alternative mit deutlich mehr Grafikleistung: Mini-PC mit Intel N100/N150.
Getestet werden **1024×600, 1280×800 und 1920×1200**.

| Leitlinie | Stand |
|---|---|
| Lesbarkeit aus 2–3 m, Schriften in `vmin`/`clamp()` | ✅ |
| Kein Scrollen, Touch-Ziele ≥ 48 px, Steuerleiste blendet nach 6 s aus | ✅ |
| Oberfläche nur Deutsch, `de-DE`-Formate (österreichisch „Jänner“) | ✅ |
| Automatische Qualitätsstufen (niedrig/mittel/hoch, „Auto“ nach Bildrate) | ✅ |
| Robust: Fehlergrenzen je Avatar/Szene, 2D-Ersatz ohne WebGL, Neuaufbau nach GPU-Reset | ✅ |
| **Burn-in-Schutz** (minimale Drift statischer Elemente, Abdunkeln im Leerlauf) | ✅ |
| **Watchdog** (Lebenszeichen an die Pi-Bridge, Kiosk-Neustart per systemd) | ✅ |
| **Display-Zeitplan** (nachts aus, z. B. per `wlr-randr`/HDMI-CEC) | ○ |

---

## 4. Architektur (wie gebaut)

Kernidee unverändert: **ein Song-Kontext** mit allen Informationen zum aktuellen Song. Quellen schreiben hinein,
Anzeige und Steuerung lesen nur daraus.

```
Browser (Dashboard)
├─ Quellen → SONG-KONTEXT (lib/song-context: zod-Schema, Zustand-Store, Ereignisse, derive())
│  useSpotifySync  /api/now-playing   Track, Artists, Album, Wiedergabe (Uhr-Abgleich)
│  useLyricsLoader /api/lyrics        Provider-Kette (Neuversuche nach 10/30/90 s)
│  useInfoLoader   /api/info          MusicBrainz → Wikidata → Wikipedia, Commons, TheAudioDB, Flickr, Genius
│  useUserLoader   /api/personal      Lieblingssong, Follows, Last.fm-Hörzahlen
│  useConcertLoader /api/concerts     oeticket, Ticketmaster, Bandsintown, setlist.fm
│  useMicAnalysis  Mikrofon           Tempo, Beat-Phase, Energie, Drops
│  Cover-Palette   extractPalette()   Farben für UI, Bühne, Lampen
└─ Verbraucher (lesen nur)
   HUD · LyricsLayer (LyricsDirector) · Stage (DanceDirector, LightDirector) · Info-/Konzertkarte
   useBridge → WebSocket → Pi-Bridge → Govee (LAN/UDP)
   useSnapshotReporter → /api/song-context → Upstash (Alexa liest, Befehle zurück)
```

### 4.1 Song-Kontext

Drei Schichten wie geplant: **Stammdaten** (einmal pro Song, schrittweise angereichert), **Wiedergabe**
(Spotify alle 1–3 s, lokal interpoliert, Offset pro Gerät) und **Live/abgeleitet** (pro Frame, ohne React-Rerender).

Stammdaten heute (Auszug, vollständig in `lib/song-context/schema.ts`):

| Bereich | Inhalt |
|---|---|
| `track`, `artists`, `album`, `cast` | Spotify-Daten, Feature-Erkennung, Avatar-Besetzung, Palette |
| `lyrics` | Zeilen mit Wörtern, **Silben** (`syllables`), Sänger (`agent` → Artist), **Umschrift** und **Übersetzung** je Zeile, Abschnitte (vom Provider oder erkannt), Qualität |
| `info` | je Artist Text (Wikipedia oder TheAudioDB), Fakten, Logo; Fotos mit Quelle, Art und Lizenz; Song-Trivia (Genius) |
| `user` | Lieblingssong, Last.fm-Herz, Hörzahl, Follows und Hörzahlen je Artist |
| `concerts`, `setlists` | nächste Termine (Umkreis zuerst), letzte Setlist |
| `status` | je Quelle: lädt / ok / fehlt / Fehler, mit Provider |

Ereignisse (`trackChanged`, `sectionChanged`, `beat`, `drop`, `paused` …) treiben Tanz, Licht und Lampen.
Demos laden einen kompletten Kontext aus Fixtures (`/?demo=<name>&t=<ms>`), dadurch sind Screenshots reproduzierbar.

### 4.2 Server-Schicht und Cache

| Route | Aufgabe |
|---|---|
| `/api/auth/*` | Spotify OAuth mit PKCE, Session AES-256-GCM im httpOnly-Cookie, Single-Flight-Refresh |
| `/api/now-playing`, `/api/player/[action]` | Wiedergabe lesen und steuern |
| `/api/lyrics` | Provider-Kette, Treffer-Prüfung, Ranking |
| `/api/info`, `/api/personal`, `/api/recent`, `/api/concerts` | Anreicherung (nur angemeldet) |
| `/api/song-context` | Schnappschuss für Alexa (alle 15 s beim Abspielen), Befehle zurück |
| `/api/alexa` | Alexa-Skill mit vollständiger Signaturprüfung |

Cache: Upstash Redis (sonst Arbeitsspeicher), Einträge ab 1 KB gzip-komprimiert, Haltedauern zentral in
`lib/cache-policy.ts`: Lyrics 180 Tage (nicht gefunden 3 Tage), Band-Infos 30 Tage (unvollständig 3 Tage),
Konzerte 12 h (Teilergebnis 30 min), Setlist 3 Tage, Schnappschuss 2 h, Befehle 5 min. Fehlschläge werden nie lange gecacht.

### 4.3 Bewusste Abweichungen vom ursprünglichen Plan

| Geplant | Umgesetzt | Grund |
|---|---|---|
| Ein Aggregator `/api/song-context` mit Server-Sent Events | getrennte Routen je Quelle, Zusammensetzen im Browser | einfacher, jede Quelle mit eigenem Cache und Neuversuch; beat-genaue Daten entstehen ohnehin im Browser |
| AudioWorklet | `AnalyserNode` + Auswertung im Haupt-Thread (`lib/audio`) | reicht für Tempo/Beat/Energie, einfacher zu testen |
| MSW für API-Mocks | Playwright-Routen-Mocks | weniger Abhängigkeiten |
| Genius als Lyrics-Text-Referenz | Genius nur für Trivia | die API liefert keine Songtexte |
| Apple-TTML entfällt (kein Developer-Zugang) | **Better Lyrics** liefert Apple-TTML | Dienst `lyrics-api.boidu.dev`, ohne Key für gecachte Songs |
| QQ Music, „lyricsplus“ | entfallen | QQ nur verschlüsselt, lyricsplus abgeschaltet |
| Alexa mit Account-Linking | ein Dashboard = ein Spotify-Nutzer | für privaten Betrieb ausreichend |
| Flickr nur freie Lizenzen | alle Lizenzen mit Angabe | Wunsch für das private Dashboard |

---

## 5. Spotify

✅ PKCE-Login, verschlüsselte Session, Single-Flight-Refresh (Spotify rotiert Refresh-Tokens), Konto-Allowlist
(`ALLOWED_SPOTIFY_USERS`), Polling mit lokaler Uhr, manueller Lyrics-Offset pro Gerät, Steuerleiste
(Play/Pause/Skip). Spotify sperrt *Audio Features/Analysis* für neue Apps: Tempo und Energie kommen aus dem Mikrofon;
den Startwert liefert Deezer über die ISRC (ohne Treffer 120 BPM).

---

## 6. Lyrics

### 6.1 Provider-Kette (Stand Nov. 2026, gegen echte Schnittstellen geprüft)

Alle Provider parallel mit Timeout und Circuit-Breaker; jeder Treffer wird gegen Titel, Artist, Version und Dauer
(± 3,5 s) geprüft. Rangfolge: eigene Korrekturen > Wort-Sync > Zeilen-Sync > reiner Text, dann Priorität.

| Prio | Provider | Liefert | Zugang |
|---|---|---|---|
| 0 | Lokale Korrekturen (`data/lyrics`) | beliebig | Repo |
| 10 | **Better Lyrics** | Apple-TTML: Wort + Silben, Abschnitte, Sänger, Umschrift, Übersetzung | ohne Key nur gecachte Songs (`BETTER_LYRICS_API_KEY` optional) |
| 20 | Musixmatch Desktop | Zeilen-Sync | inoffiziell; aus Rechenzentren Lockvogel-Treffer, werden verworfen |
| 25 | Spotify Color-Lyrics | Zeile, teils Silben | Anmelde-Token, sonst `SPOTIFY_SP_DC` + TOTP |
| 30 | NetEase | Wort-Sync (YRC) | inoffiziell |
| 50 | LRCLIB | Zeile, teils Wort | offen |

Ein täglicher **Provider-Check** (GitHub Action) prüft die echten Dienste und legt bei Ausfall ein Issue an.

### 6.2 Verarbeitung

- **TTML-Parser** (`lib/lyrics/parse-ttml.ts`): Wort-Spans, getrennte Silben mit eigenem Timing, Hintergrundgesang
  ausgelassen, Satzzeichen außerhalb der Spans, `itunes:`- und `lrc:`-Namensraum, Abschnitte aus `songPart`,
  Sänger nur für `person`/`character`, Umschrift und Übersetzung über den Zeilenschlüssel.
- **Nur Zeilen-Sync:** Wörter werden nach Silben geschätzt (Qualität „word-estimated“).
- **Abschnitte:** vom Provider (TTML) oder per Wiederholungserkennung.

### 6.3 Darstellung

Der **LyricsDirector** wählt pro Abschnitt: **Karaoke**, **Wort-Pop**, **Stapel**, **Schreibmaschine**, **Duett**
(Feature-Songs, Sänger in ihren Farben). Refrains abwechselnd auffällig, schnelle Parts als Wort-Pop.
Die Karaoke-Füllung folgt Silbe für Silbe. **Zweite Zeile**: Umschrift automatisch bei nicht-lateinischer Schrift,
deutsche Übersetzung falls vorhanden, Schalter „2. Zeile“. Info- und Konzertkarte haben Vorrang; die Lyrics machen Platz.

---

## 7. Mikrofon-Analyse

✅ Tempo per Autokorrelation mit Oktav-Korrektur, Beat-Phase (PLL), Tempo-Verriegelung, Energie, Drop-Erkennung
(`lib/audio`). Audio bleibt im Browser. Ohne Mikrofon läuft alles mit 120 BPM weiter.
○ **Wort-Timing per Mikrofon verfeinern** und ○ **Lyrics-Offset automatisch nachjustieren** (siehe 13).

---

## 8. 3D-Szene & Tanz

✅ **DanceDirector** mit deterministischem Plan pro Song: Phrasen statt Loops, Wiederholungssperre, Formationen,
synchrone Refrains, Kamera-Einstellung je Abschnitt, aktiver Sänger tritt nach vorn, LED-Gesichter.
✅ **LightDirector**: Szenen je Abschnitt, Moving Heads, Laser, Nebel, LED-Wand mit Band-Foto (wechselt je Abschnitt),
Stroboskop nur bei Drops und abschaltbar.

---

## 9. Qualitätssicherung

| Workflow | Inhalt |
|---|---|
| `ci.yml` | Prettier, ESLint, `tsc`, Vitest mit Mindestabdeckung (88/78/85/90 %), Build |
| `e2e.yml` | Playwright im offiziellen Container, je Auflösung ein paralleler Job, Screenshot-Vergleich |
| `update-screenshots.yml` | erzeugt Referenzbilder im Container, startet danach E2E |
| `provider-check.yml` | täglich gegen echte Dienste, Issue bei Ausfall |
| `codeql.yml`, `security.yml` | CodeQL, `npm audit`, Gitleaks, Dependency-Review |
| `workflows-lint.yml` | actionlint |
| Dependabot | npm und Actions |

Stand: **263 Unit-Tests** (Abdeckung ~91 % Anweisungen), **54 E2E-Tests je Auflösung**. Actions auf Commit-SHAs gepinnt.
Testdaten aus echten Antworten sind gespeichert (oeticket, TheAudioDB, Better Lyrics); Songtexte darin sind durch
Platzhalter ersetzt.

---

## 10. Hosting

Vercel: `main` → Production, Branches → Preview. Bilder von TheAudioDB/Flickr laufen über den Next.js-Bildoptimierer
(eigene Domain, kein CORS-Problem für WebGL, kleiner für den Pi). CSP, `Permissions-Policy`, keine Tokens im Browser.

---

## 11. Ausbaustufen 2–5: Detailstand

### Stufe 2 – Bühne & Licht
✅ Bühne, LED-Wand, Moving Heads, Laser, Nebel, Bloom, Qualitätsstufen, geräteunabhängiges Lichtsignal ·
✅ Logo der Band über der LED-Wand (ruhige Teile) · ○ 3D-Lyrics in der Szene für Refrain-Momente

### Stufe 3 – Govee & Alexa
✅ Pi-Bridge (`bridge/`, systemd, nur lokal, Origin-Prüfung), Govee LAN mit Discovery und Rollen
(Puls/Akzent/Grund) · ○ Segment-Streaming für RGBIC-Lauflichter · ○ Geräte-Zuordnung per Oberfläche statt Konfigurationsdatei
✅ Alexa: Welcher Song, wer singt, Erscheinungsjahr, Konzerte in der Nähe, wie oft gehört, mag ich den Künstler,
Band-Infos, Lampen/Strobo/Qualität · ○ virtuelles Smart-Home-Gerät („Party-Modus“ für Routinen) ·
✅ Song per Sprache merken

### Stufe 4 – Band-Infos & Fotos
✅ MusicBrainz → Wikidata → Wikipedia (de, sonst en), Commons-Fotos mit Lizenz, Infokarte in ruhigen Teilen,
Fakten-Ticker in Strophen, Feature-Artists abwechselnd · ○ Wikipedia-Artikel zum Song/Album als Trivia

### Stufe 5 – Persönliches, Konzerte, weitere Quellen
✅ Zuletzt gehört (Last.fm, sonst Spotify), Lieblingssong, Herz, Hörzahlen, ★ bei gefolgten Künstlern ·
✅ Song per Touch liken · ✅ Begrüßung bei gefolgten Künstlern (Avatar winkt) · ○ ähnliche Künstler und Tags (Last.fm)
✅ Konzerte aus vier Quellen, zusammengeführt, Umkreis Wien, Countdown, QR-Code, letzte Setlist ·
✅ Geocoding für Orte ohne Koordinaten (OpenStreetMap) · ○ Heimatort/Umkreis in den Einstellungen statt Env · ✅ Eventim DE · ○ Reservix
✅ TheAudioDB, Flickr, Genius-Trivia, Fotoauswahl je Verwendung

---

## 12. Bewertung: Was fehlt, was verbessert werden sollte

### 12.1 Betrieb auf dem Gerät (größte Lücke)

Alles läuft in der Cloud und im Test-Browser. Auf echter Hardware wurde **noch nichts gemessen**.

| Thema | Problem heute | Vorschlag |
|---|---|---|
| Leistung | Bildrate auf dem Pi unbekannt | Bildrate und Frame-Zeiten im Debug-Panel protokollieren, Standard-Qualität danach festlegen |
| Ausfallsicherheit | ✅ Lebenszeichen an die Pi-Bridge, Watchdog startet den Kiosk-Dienst neu | – |
| Blindflug | ✅ Fehler und Leistungsproben im Kiosk-Protokoll (`/api/log`, Debug-Panel) | – |
| Startzeit | ✅ geklärt: Avatare werden ein Jahr gecacht (jetzt mit Version in der Adresse) | – |
| Einrichtung | Bridge, Kiosk, Schriften von Hand | ein Setup-Skript für den Pi (Chromium-Autostart, Bridge, `fonts-noto-cjk`, Mikrofon-Freigabe) |
| Display | läuft rund um die Uhr | Zeitplan (nachts aus), Burn-in-Schutz, im Leerlauf abdunkeln |

### 12.2 Synchronität und Datenqualität

| Thema | Vorschlag |
|---|---|
| Lyrics-Versatz | Mikrofon erkennt Gesangseinsätze, vergleicht mit Zeilenstarts und schlägt einen Offset vor (oder stellt ihn automatisch ein) |
| geschätzte Wort-Timings | Silben-Onsets aus dem Mikrofon verschieben Wortgrenzen (war geplant, offen) |
| Konzerte | Heimatort/Umkreis in den Einstellungen (Geocoding und Eventim DE sind umgesetzt) |
| Lizenz-/Quellenangaben | Flickr ohne Lizenzfilter ist nur privat vertretbar; bei öffentlicher Nutzung wieder einschränken |

### 12.3 Interaktion und Erlebnis

| Thema | Vorschlag |
|---|---|
| Liken | Herz in der Kopfzeile antippen speichert den Song in den Lieblingssongs; auch per Alexa („merk dir den Song“) |
| Party-Modus | Alexa-Smart-Home-Gerät: Routine startet Playlist, mehr Tänzer, volle Lichtshow, Lampen auf Szene |
| Leerlauf | Startbildschirm mit Wochen-Statistik (Top-Künstler, Last.fm), ähnliche Künstler, nächstes Konzert der Lieblingskünstler |
| Bühne | Band-Logo als Projektion, 3D-Lyrics im Refrain, Avatar winkt bei gefolgten Künstlern |
| Übersetzung | Better Lyrics liefert fast nur Englisch; eine deutsche Übersetzung bräuchte einen Übersetzungsdienst (Kosten, Qualität) – nur auf Wunsch |

### 12.4 Technik und Wartung

| Thema | Vorschlag |
|---|---|
| Abhängigkeit von inoffiziellen Diensten | ist gewollt; Provider-Check und Breaker fangen Ausfälle ab. Bei dauerhaftem Ausfall Provider in `LYRICS_PROVIDERS` abschalten |
| GitHub | Branch-Schutz für `main` mit Pflicht-Checks einschalten (Einstellung in GitHub, nicht im Code) |
| Vercel-Kontingente | Bildoptimierer und Funktionsdauer im Blick behalten (Hobby-Tarif); Bilder werden 30 Tage gecacht |
| Production | `ALLOWED_SPOTIFY_USERS` setzen, Upstash verbinden |

---

## 13. Vorschlag: nächste Ausbaustufen

Aufwand: S = bis ½ Tag, M = 1–2 Tage, L = mehrere Tage.

### Stufe 6 – Betrieb auf dem Gerät *(sobald der Pi da ist, höchste Priorität)*

| Baustein | Aufwand |
|---|---|
| Pi-Setup-Skript: Kiosk-Autostart, Pi-Bridge, Schriften, Mikrofon-Freigabe, Display-Zeitplan | M |
| ✅ Watchdog über die Pi-Bridge (Lebenszeichen, Neuladen), systemd-Neustart von Chromium | S |
| ◐ Bildraten-Protokoll im Debug-Panel (✅), Messung je Qualitätsstufe und Standard festlegen (braucht Gerät) | S |
| ✅ Fehler-Telemetrie `/api/log` mit Anzeige im Debug-Panel | S |
| ✅ entfällt: Avatare werden schon ein Jahr „immutable“ gecacht; neu: Version in der Adresse, damit Updates ankommen | S |
| ✅ Burn-in-Schutz und Abdunkeln im Leerlauf | S |
| Govee: Geräte-Zuordnung per Oberfläche, Segment-Lauflichter für RGBIC (falls die Geräte es können) | M |

### Stufe 7 – Synchronität & Datenqualität

| Baustein | Aufwand |
|---|---|
| Automatischer Lyrics-Offset aus Gesangseinsätzen (Vorschlag, auf Wunsch automatisch) | M |
| Wort-Timing-Verfeinerung per Mikrofon für geschätzte Wörter | L |
| ✅ Lyrics-Cache: Treffer behalten, nur „nicht gefunden“ bei Provider-Änderung neu prüfen | S |
| ✅ BPM-Startwert aus externer Quelle (Deezer über ISRC, korrigiert auch Oktavfehler des Mikrofons) | S |
| Konzerte: ✅ Geocoding; ✅ Eventim DE; offen: Heimatort/Umkreis in den Einstellungen | M |

### Stufe 8 – Interaktion

| Baustein | Aufwand |
|---|---|
| ✅ Song liken per Touch und Alexa (`user-library-modify`) | S |
| Alexa-Smart-Home-Gerät „Party-Modus“ (OAuth, eigener Smart-Home-Skill) | L |
| weitere Alexa-Befehle: „Was ist das für ein Sample?“ (Genius) · Wiedergabe (nächster Song, Pause) **entfällt**: Befehle erreichen das Dashboard erst mit der nächsten Meldung (bis 15 s), Alexa steuert Spotify direkt | S |

### Stufe 9 – Show

| Baustein | Aufwand |
|---|---|
| ✅ Band-Logo als Bühnenprojektion, Avatar winkt bei gefolgten Künstlern | S |
| 3D-Lyrics in der Szene für Refrain-Highlights (nur ab Qualität „mittel“) | M |
| Leerlauf-Bildschirm: Wochen-Statistik, ähnliche Künstler, nächstes Konzert der Lieblingskünstler | M |

**Empfohlene Reihenfolge:** Stufe 6 sobald Hardware da ist. Bis dahin aus Stufe 7 die kleinen Bausteine
(Lyrics-Cache, BPM-Startwert, Geocoding) und aus Stufe 8 „Song liken“, weil sie ohne Gerät testbar sind.

---

## 14. Offene Fragen

1. **Rechner:** Raspberry Pi 5 (8 GB) oder N100-Mini-PC? Beides wird unterstützt; die Wahl bestimmt die Standard-Qualitätsstufe.
2. **Display-Zeitplan:** Soll das Dashboard nachts ausgehen, und wenn ja, wann?
3. **Lyrics-Offset automatisch:** nur vorschlagen oder selbstständig einstellen?
4. **Better-Lyrics-Schlüssel:** bei den Betreibern anfragen oder ohne Schlüssel bleiben?

### Geklärt
Raspberry Pi mit Chromium im Kiosk-Modus · Spotify-App und Premium · kein Apple-Developer-Zugang · inoffizielle Quellen
erwünscht · nur Deutsch · Feature-Songs mit mehreren Tänzern · Mikrofon vorhanden · Referenzformat 1280×800 ·
Referenz-Screenshots im Repo · Govee-Geräte alle per LAN · zentraler Song-Kontext · Last.fm (Spotify scrobbelt) ·
Konzerte: Wien, 200 km, oeticket inoffiziell · Flickr ohne Lizenzfilter · Schnappschuss für Alexa ohne Liedzeile,
mit Erscheinungsjahr, Meldung alle 15 s · Umschrift/Übersetzung als zweite Zeile.
