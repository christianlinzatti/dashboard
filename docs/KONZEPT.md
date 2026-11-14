# Konzept: „Sonic Stage“ – Lyric-Dashboard (10 Zoll)

Stand: 2026-11-14 · Status: Entwurf v2 (Rückmeldungen eingearbeitet)

---

## 1. Ziel

Eine Web-App (Next.js/React), die auf einem 10-Zoll-Dashboard im Vollbild läuft und

1. den **aktuell auf Spotify laufenden Song** anzeigt (Cover, Titel, Artist, Fortschritt),
2. die **Lyrics synchron, möglichst Wort für Wort**, in wechselnden, spannenden Darstellungen einblendet,
3. **3D-Avatare (Three.js)** zeigt, die **passend zum Song tanzen** (Tempo, Energie, Stil),
4. den Song **live über das Mikrofon analysiert** (Beat, BPM, Energie, Frequenzbänder),
5. über **Vercel** gehostet und über **GitHub Actions** abgesichert wird (Lint, Typen, Tests, Playwright-Screenshots, Security-Scans).

Weitere Ausbaustufen:
- **Stufe 2:** Bühne mit Lichteffekten (Spots, Lichtkegel, Laser, Nebel, Bloom), beat-synchron.
- **Stufe 3:** **Govee-Lichter** und **Alexa** einbinden.
- **Stufe 4:** **Band-Fotos und Infotexte** (z. B. Wikipedia) anzeigen.
- **Stufe 5:** **Persönliches & Konzerte**: zuletzt gespielte Songs (Last.fm), Anzeige, ob ich Song/Künstler mag, bevorstehende Konzerte aus mehreren Konzert-Providern; zusätzliche Quellen Genius, MusicBrainz, Flickr, TheAudioDB.

**Festgelegt:** Raspberry Pi mit Chromium im Kiosk-Modus · Spotify-Developer-App und Premium vorhanden · kein Apple-Developer-Zugang · inoffizielle Lyrics-Quellen sind gewünscht · Oberfläche **ausschließlich auf Deutsch**.

---

## 2. Bestandsaufnahme: vorhandene Avatare (`/avatars`)

| Eigenschaft | Wert |
|---|---|
| Anzahl | 11 (`atlas-prism`, `aurora-synth`, `chrome-beat`, `ember-rock`, `festival-nova`, `luna-flow`, `neon-pulse`, `quantum-bass`, `rio-carnival`, `sol-groove`, `velvet-jazz`) |
| Format | GLB + PNG-Vorschau (384×384) + `manifest.json` (Clips, Dreiecke, Joints, SHA-256) |
| Lizenz | CC0 1.0 – frei nutzbar |
| Geometrie | 13–16k Dreiecke, 1 Mesh, 6 Materialien, keine Texturen, `KHR_materials_emissive_strength` |
| Skelett | Humanoid, 44–47 Joints, Namen im Mixamo-Stil (`Hips`, `Spine`, `LeftArm`, …) |
| Besonderheit | **LED-Gesichts-Bones** (`FaceLedEyeLeft/Right`, `FaceLedBar0–4`) → lassen sich als VU-Meter/„Mund“ zur Stimme ansteuern |
| Clips | 22–32 pro Avatar, **20 bei allen vorhanden**; Längen 2/3/4/12/16 s (2 s/4 s = 1/2 Takte bei 120 BPM) |
| Größe | ~44 MB gesamt (3,2–4,7 MB je Avatar) → **muss komprimiert werden** (siehe 8.2) |

**Gemeinsame Clips (bei allen 11):** `Idle_Breathe`, `Gesture_Wave`, `Dance_Groove`, `Dance_Techno`, `Dance_House`, `Dance_HipHop`, `Dance_Disco`, `Dance_Shuffle`, `Dance_Robot`, `Dance_RobotGroove`, `Dance_FestivalBounce`, `Dance_CrossStep`, `Dance_DiagonalStep`, `Dance_FluidArc`, `Dance_FrontmanDrive`, `Dance_HeelToe`, `Dance_JazzRebound`, `Dance_PivotStep`, `Dance_SideGlide`, `Dance_TurnPhrase`.
Zusätzlich je nach Avatar u. a. `Dance_LatinSway`, `Dance_JazzSwing`, `Dance_Waltz`, `Dance_RockDrive`, `Dance_AfroPulse`, `Dance_PowerHit`, `Dance_Stomp`, `Dance_LiquidWave`, `Dance_PopLock`, `Dance_Clockwork`.

Da das Skelett einheitlich ist, kann jeder Clip grundsätzlich auf jeden Avatar übertragen werden (Retargeting ist nicht nötig, nur Clip-Sharing bei gleichen Bone-Namen).

---

## 3. Zielgerät & UX-Rahmen

**Gerät:** Raspberry Pi (noch nicht gekauft) mit 10-Zoll-Display, Chromium im Kiosk-Modus.

**Hardware-Empfehlung:**

| Komponente | Empfehlung | Begründung |
|---|---|---|
| Rechner | **Raspberry Pi 5, 8 GB** + aktiver Kühler + offizielles 27-W-Netzteil | schnellste Pi-GPU (VideoCore VII, WebGL2); ein Pi 4 wäre für mehrere 3D-Tänzer zu knapp |
| Speicher | NVMe-SSD über M.2-HAT (alternativ gute A2-microSD) | schnellerer Start, Chromium-Cache, langlebiger als SD |
| Display | 10,1" IPS, **1280×800**, HDMI + USB-Touch | bei 10" der beste Kompromiss aus Schärfe und GPU-Last; 1920×1200 würde den Pi bei 3D deutlich ausbremsen |
| Mikrofon | USB-Mikrofon (Kugel- oder Nierencharakteristik), Richtung Lautsprecher | vorhanden |
| Alternative | **Mini-PC mit Intel N100/N150** (ähnlicher Preis inkl. Netzteil) | deutlich mehr Grafikleistung: 5 Tänzer + volle Bühnen-Effekte (Stufe 2) ohne Abstriche. Empfehlenswert, wenn die Bühne später ein Schwerpunkt wird |

Damit wird **1280×800 das Referenzformat** (Standard-Viewport für Screenshots). Das Layout bleibt trotzdem auflösungsunabhängig, falls doch ein anderes Panel kommt; deshalb wird das Layout **auflösungsunabhängig** gebaut (Schriftgrößen in `vmin`/`clamp()`, 3D-Kamera passt sich dem Seitenverhältnis an). Getestet werden die typischen 10-Zoll-Panels **1024×600**, **1280×800** und **1920×1200**.

**Raspberry-Pi-spezifisch:**
- Die GPU ist schwach. Standard sind **2–3 Avatare**, keine Echtzeit-Schatten (gebackener Bodenschatten), DPR 1,0, Ziel 60 fps auf Pi 5 und ≥ 30 fps auf Pi 4. Mehr Tänzer nur bei Feature-Songs mit vereinfachtem Shading (siehe 8.1).
- Chromium-Flags: `--kiosk --ignore-gpu-blocklist --enable-gpu-rasterization --autoplay-policy=no-user-gesture-required`, Autostart über systemd/labwc, Watchdog lädt die Seite bei Absturz neu.
- Mikrofon: USB-Mikrofon ist vorhanden.
- Ein kleiner **lokaler Dienst auf dem Pi („Pi-Bridge“)** wird ab Stufe 3 gebraucht, weil der Browser keine Geräte im Heimnetz ansteuern kann (Govee per LAN/UDP).

**Sprache:** Alle Texte der Oberfläche sind deutsch. Zahlen- und Zeitformat `de-DE`, keine Sprachumschaltung.

Leitlinien:
- **Lesbarkeit aus 2–3 m:** aktive Lyric-Zeile ≥ 56 px, Kontextzeilen ≥ 28 px, hoher Kontrast, dunkles Theme (spart Strom/OLED-schonend).
- **Kein Scrollen, kein Hover:** alles auf einem Screen; Touch-Ziele ≥ 48 px.
- **Ambient-First:** UI-Chrome blendet nach 5 s ohne Berührung aus; Tippen zeigt Steuerleiste (Play/Pause/Skip, Lyrics-Offset ±, Modus, Avatar-Auswahl, Mikro an/aus).
- **Burn-in-Schutz:** statische Elemente driften minimal; Idle-Screensaver, wenn nichts läuft.
- **Performance-Budget:** stabil 60 fps bei 1280×800, Pixel-Ratio auf max. 1.5 gedeckelt, automatische Qualitätsstufen (siehe 8.3).

### Layout (1280×800)

```
┌──────────────────────────────────────────────────────────────┐
│ [Cover] Titel – Artist                     ● LIVE  128 BPM   │  ← Kopfzeile 72 px (blendet aus)
├──────────────────────────────────────────────────────────────┤
│                                                              │
│         3D-Szene: 3–5 tanzende Avatare (Hintergrund)         │
│                                                              │
│            vorherige Zeile (gedimmt)                         │
│      ▶  AKTIVE ZEILE  wort  für  WORT  gefüllt  ◀             │  ← Lyrics-Layer (Overlay)
│            nächste Zeile (gedimmt)                           │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬○─────────────── 1:42 / 3:58          │  ← Fortschritt 8 px
└──────────────────────────────────────────────────────────────┘
```

---

## 4. Architektur

Kernidee: **Es gibt genau einen Ort mit allen Informationen zum aktuellen Song – den Song-Kontext.** Alle Datenquellen schreiben hinein, alle Anzeige- und Steuerungsmodule lesen nur daraus. Kein Modul holt sich selbst Daten aus Spotify, Lyrics-Providern oder Wikipedia.

```
            QUELLEN (schreiben)                         VERBRAUCHER (lesen)
┌───────────────────────────────────┐            ┌──────────────────────────────────┐
│ Spotify (Track, Artists, Album,   │            │ HUD (Titel, Cover, Fortschritt)  │
│   Wiedergabe)                     │            │ LyricsDirector  → Lyrics-Modi    │
│ Lyrics-Provider-Kette             │            │ DanceDirector   → Avatare/Tanz   │
│ Mikrofon-Analyse (live)           │──────────► │ LightDirector   → Bühne (St. 2)  │
│ BPM/Genre-Anreicherung            │   SONG-    │ Pi-Bridge       → Govee (St. 3)  │
│ MusicBrainz / Wikipedia / Commons │  KONTEXT   │ Alexa-Skill     → Sprache (St. 3)│
│ Flickr / TheAudioDB / Genius      │            │ InfoDirector    → Konzerte (St.5)│
│ Last.fm / Spotify-Bibliothek      │            │ Verlauf & Likes → HUD    (St. 5) │
│ Konzert-Provider                  │            │                                  │
│ Cover-Farbanalyse                 │            │ InfoDirector    → Fotos/Texte (4)│
│ Nutzer-Einstellungen (Offset …)   │            │ Debug-Panel, Playwright-Fixtures │
└───────────────────────────────────┘            └──────────────────────────────────┘
```

### 4.1 Song-Kontext

Der Song-Kontext ist ein **typisiertes, versioniertes Objekt** (zod-Schema in `lib/song-context/schema.ts`), das aus drei Schichten besteht:

| Schicht | Inhalt | Wo erzeugt | Änderungsrate |
|---|---|---|---|
| **Stammdaten** (`static`) | Track, Artists, Album, Lyrics, Abschnitte, Genres, BPM-Startwert, Farben, Infotexte, Fotos | Server: `/api/song-context`, pro Track einmal aggregiert, in Redis gecacht | einmal pro Song (wird schrittweise angereichert) |
| **Wiedergabe** (`playback`) | spielt/pausiert, Songzeit, Gerät, Lautstärke, Offset | Client: Spotify-Polling + PlaybackClock | alle 1–3 s, Uhr ms-genau interpoliert |
| **Live-Analyse & Ableitungen** (`live`, `derived`) | Beat-Phase, BPM, Energie, Frequenzbänder, Stimmaktivität; aktuelle Zeile/Wort, aktueller Abschnitt, aktiver Sänger, Refrain ja/nein, Drop | Client: Mikrofon + Auswertung von Lyrics und Songzeit | pro Frame |

```ts
type SongContext = {
  schemaVersion: 1;
  trackKey: string;                       // Spotify-ID (+ ISRC zur Zuordnung externer Quellen)
  status: Record<SourceName, SourceStatus>; // pro Quelle: loading | ok | missing | error, Provider, Zeitpunkt

  track:   { spotifyId; isrc?; title; durationMs; explicit; releaseDate; popularity?; isFeature: boolean };
  artists: Array<{ spotifyId; name; role: "main" | "feature"; mbid?; genres: string[];
                   images: Image[]; avatarId: string; color: string }>;
  album:   { name; coverUrl; palette: { dominant; accent; dark; light } };

  lyrics?: LyricsDoc & {
    quality: "word" | "word-estimated" | "line" | "plain";
    sections: Array<{ kind: "intro" | "verse" | "prechorus" | "chorus" | "bridge" | "instrumental" | "outro";
                      startMs; endMs; lineIdx: [number, number] }>;
    singers?: Record<string /* agent */, string /* artist spotifyId */>;
  };

  music:   { bpmHint?: number; genres: string[]; mood?: "ruhig" | "mittel" | "energetisch" };
  info?:   { artists: Record<string, { summary; wikiUrl; lang: "de" | "en"; facts: string[] }>;
             song?: { summary; wikiUrl }; photos: Array<Image & { credit; license; sourceUrl }> };
  cast:    Array<{ avatarId; artistId?; role: "lead" | "feature" | "backup"; position: number }>;

  // Stufe 5 – persönlich & Konzerte
  user?:    { trackSaved: boolean;                         // Song in „Lieblingssongs“ (Spotify)
              lovedOnLastfm?: boolean;                     // Song auf Last.fm „geliebt“
              artists: Record<string, { following: boolean; lastfmPlays?: number; firstScrobble?: string }>;
              trackPlays?: number };                       // wie oft ich den Song gehört habe (Last.fm)
  concerts?: Array<{ artistId; date; venue; city; country; distanceKm?; ticketUrl?;
                     soldOut?: boolean; providers: string[] }>; // zusammengeführt aus mehreren Quellen

  playback: { isPlaying; positionMs; updatedAt; device?; volume?; offsetMs };
  live:     { bpm; beatPhase; bar; energy; bands: number[]; vocal: number; micActive: boolean };
  derived:  { lineIdx; wordIdx; section; isChorus; activeSingerId?; dropAt?; secondsToNextLyric };
};
```

**Regeln:**
1. **Eine Quelle der Wahrheit:** Der Kontext liegt im Client in einem Zustand-Store (`useSongContext`) mit getrennten Bereichen. React-Komponenten abonnieren nur die Felder, die sie brauchen (Selektoren). Frame-schnelle Werte (`live`, `derived`) werden über `subscribe` bzw. Refs gelesen, damit kein React-Rerender pro Frame passiert.
2. **Schrittweise Anreicherung:** Bei einem Songwechsel kommen sofort die Spotify-Daten (Titel, Cover, Artists, Besetzung), danach Lyrics, später Infos und Fotos. `/api/song-context` streamt diese Teile per Server-Sent Events; jeder Teil hat seinen Status, damit die Oberfläche weiß, was noch lädt oder fehlt.
3. **Cache pro Track:** Die Stammdaten werden in Redis unter `ctx:v1:<spotifyId>` gespeichert (Lyrics 30 Tage, Infos 7 Tage). Beim nächsten Abspielen ist der Kontext sofort vollständig da.
4. **Ereignisse:** Der Store löst typisierte Ereignisse aus: `trackChanged`, `lyricsReady`, `sectionChanged`, `chorusStart`, `beat`, `bar`, `drop`, `singerChanged`, `paused`. Die Directors reagieren darauf, statt selbst Bedingungen nachzubauen.
5. **Herkunft nachvollziehbar:** Zu jeder Information ist gespeichert, woher sie stammt (z. B. „Lyrics: Musixmatch, Wort-Sync“, „Foto: Commons, CC BY-SA 4.0, Fotograf X“). Das Debug-Panel zeigt den gesamten Kontext als Baum.
6. **Auch außerhalb des Browsers verfügbar:** Der Server speichert pro Nutzer einen kompakten Schnappschuss (`now:<user>`: Track, Artists, Abschnitt, Farben, Stimmung). Den nutzen der Alexa-Skill („Welcher Song läuft?“, „Wer ist die Band?“) und die Pi-Bridge (Grundfarben für Govee). Beat-genaue Daten gehen direkt vom Browser per WebSocket an die Pi-Bridge.
7. **Tests & Screenshots:** Ein kompletter Song-Kontext lässt sich als JSON-Fixture laden (`/?demo=<fixture>&t=<ms>`). Damit sind Playwright-Screenshots und Unit-Tests ohne Spotify oder Internet reproduzierbar.

### 4.2 Datenfluss

```
┌──────────────────────────── Browser (Dashboard) ─────────────────────────────┐
│ Spotify-Polling ─► PlaybackClock ─┐                                          │
│ /api/song-context (SSE) ──────────┼─► SONG-KONTEXT (Zustand) ─► Directors    │
│ Mikrofon ─► AudioWorklet ─────────┘        │  Ereignisse          ─► Szene,  │
│                                            │                         Lyrics, │
│                                            └─► WebSocket ─► Pi-Bridge  HUD   │
└───────────────────────────────▲──────────────────────────────────────────────┘
                                │ HTTPS / SSE
┌───────────────────────────────┴──────── Vercel (Next.js Route Handlers) ─────┐
│ /api/auth/*          Spotify OAuth (PKCE), Refresh-Token im verschl. Cookie  │
│ /api/now-playing     Spotify „currently-playing“ (nur Wiedergabe-Status)     │
│ /api/song-context    Aggregator: Spotify-Metadaten + Lyrics-Kette + Farben   │
│                      + BPM/Genre + MusicBrainz/Wikipedia/Commons → Redis     │
│ /api/alexa           Alexa-Skill-Endpunkt (liest Schnappschuss)  [Stufe 3]   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Tech-Stack

| Bereich | Wahl | Begründung |
|---|---|---|
| Framework | **Next.js (App Router, aktuelle stabile Version) + React + TypeScript (strict)** | Vercel-nativ, Route Handlers für Secrets |
| 3D | **three.js + @react-three/fiber + @react-three/drei**, später `@react-three/postprocessing` | deklarativ, `useGLTF`/`useAnimations`, Bloom für Stufe 2 |
| State | **Zustand** | performant für Frame-Updates außerhalb von React-Renders |
| Styling | **Tailwind CSS** + CSS-Variablen (Farben aus Cover extrahiert) | schnell, konsistent |
| Animation (2D) | **Motion** (Framer Motion) + reine CSS-Transforms für Wort-Füllung | GPU-freundlich |
| Audio | **Web Audio API**, `AudioWorklet`; ggf. `meyda` für Features | Echtzeit ohne Main-Thread-Last |
| Validierung | **zod** | Provider-Antworten & API-Grenzen typsicher |
| Cache | **Upstash Redis** (Vercel Marketplace) + HTTP-Cache-Header | Lyrics je Track nur einmal holen |
| Tests | **Vitest** (Unit), **Playwright** (E2E + Screenshots), **MSW** (API-Mocks) | |

### Ordnerstruktur (geplant)

```
/app
  /(dashboard)/page.tsx          Hauptansicht
  /api/auth/login|callback|logout/route.ts
  /api/now-playing/route.ts
  /api/song-context/route.ts     Aggregator (SSE)
/components
  /stage       Scene.tsx, Avatar.tsx, DanceDirector.ts, (Stufe 2: Lights.tsx)
  /lyrics      LyricsLayer.tsx, modes/*.tsx
  /hud         NowPlayingBar.tsx, Controls.tsx, Progress.tsx
/lib
  /song-context schema.ts, store.ts, events.ts, aggregator/*.ts, derive.ts, fixtures/
  /spotify     client.ts, auth.ts, clock.ts
  /lyrics      types.ts, providers/*.ts, chain.ts, parse-lrc.ts, parse-ttml.ts, word-timing.ts
  /audio       analyzer.ts, beat-worklet.ts, bpm.ts
  /dance       clip-catalog.ts, mapping.ts
/public/avatars  komprimierte GLBs (Build-Schritt aus /avatars)
/tests/unit
/playwright      tests/*.spec.ts, screenshots/, fixtures/
/.github/workflows
/docs
```

---

## 5. Spotify-Integration

- **OAuth Authorization Code + PKCE** über eigene Spotify-Developer-App. Scopes: `user-read-currently-playing`, `user-read-playback-state`, `user-read-recently-played`, `user-library-read` (Song gespeichert?), `user-follow-read` (Künstler gefolgt?), optional `user-modify-playback-state` (Steuerleiste).
- Redirect-URI: `https://<projekt>.vercel.app/api/auth/callback` und für lokal `http://127.0.0.1:3000/api/auth/callback` (Spotify akzeptiert kein `localhost` mehr).
- **Refresh-Token** verschlüsselt (AES-GCM, Schlüssel als Vercel-Env-Var) in einem `httpOnly; Secure; SameSite=Lax`-Cookie → Dashboard bleibt dauerhaft eingeloggt, kein Token im JS.
- **Polling:** `/api/now-playing` alle 3 s, bei Trackwechsel-Nähe (letzte 5 s) jede Sekunde; zusätzlich sofort bei Sichtbarkeitswechsel.
- **PlaybackClock:** interpoliert `progress_ms` lokal mit `performance.now()`, korrigiert sanft (Slew statt Sprung) bei jedem Poll; Latenz-Kompensation über gemessene Round-Trip-Zeit. **Manueller Offset** (±50 ms-Schritte) pro Gerät gespeichert.

**Wichtige Einschränkung:** Spotify hat die Endpunkte *Audio Features* und *Audio Analysis* (BPM, Energy, Danceability, Beats) für neue Apps gesperrt. Tempo und Energie kommen daher aus der **Mikrofon-Analyse** (Abschnitt 7) und optional aus externen Quellen (z. B. GetSongBPM-API) als Startwert.

Spotify-Dev-Apps im Entwicklungsmodus sind auf wenige freigeschaltete Nutzer begrenzt – für ein privates Dashboard reicht das.

---

## 6. Lyrics

### 6.1 Einheitliches Datenmodell

```ts
type LyricsDoc = {
  trackKey: string;               // ISRC oder normalisiert "artist|title|duration"
  provider: string;
  sync: "word" | "line" | "none"; // Qualitätsstufe
  lines: Array<{
    startMs: number; endMs: number;
    text: string;
    agent?: "v1" | "v2" | "bg";  // Duett / Background-Vocals (aus TTML)
    words?: Array<{ startMs: number; endMs: number; text: string }>;
  }>;
};
```

### 6.2 Provider-Kette (Wort-für-Wort bevorzugt)

Alle Provider implementieren dasselbe Interface (`search(track) → LyricsDoc | null`). Die Kette fragt **parallel** an (mit Timeout), bewertet und nimmt das beste Ergebnis: **word > line > plain**, bei Gleichstand Provider-Priorität und Dauer-Abgleich (± 2 s zur Spotify-Trackdauer).

| Prio | Provider | Sync-Level | Zugang | Status/Hinweis |
|---|---|---|---|---|
| 1 | **Musixmatch (Richsync, offiziell)** | Wort | kostenpflichtiger Key | nur aktiv, falls später ein Key vorliegt |
| 2 | ~~Apple Music (TTML)~~ | Wort | Apple-Developer-Account | **entfällt** (kein Zugang); TTML-Parser bleibt für Aggregatoren, die TTML liefern |
| 3 | **Musixmatch Desktop-API (Richsync, inoffiziell)** | Wort | anonymer Desktop-User-Token | große Abdeckung, Wort-Sync; Token läuft ab und wird automatisch erneuert |
| 4 | **Community-Aggregatoren (z. B. „Lyrics+“-artige APIs)** | Wort/Zeile | offen | Verfügbarkeit schwankt |
| 5 | **Spotify Color-Lyrics** (Ansatz von `simonroedig/SpotifyLyrics`) | meist Zeile, teils Silben | `sp_dc`-Cookie → Web-Player-Token | Laut Repo **nicht mehr funktionsfähig**, weil Spotify die Token-Ausgabe (TOTP-basiert) geändert hat. Wird mit aktualisierter Token-Logik umgesetzt, **bricht aber erwartbar immer wieder** → automatisch deaktiviert, wenn er wiederholt fehlschlägt |
| 6 | **NetEase (YRC) / QQ Music (QRC)** | Wort | inoffiziell | stark bei asiatischem Repertoire, Wort-Sync |
| 7 | **LRCLIB** | Zeile (teils Enhanced-LRC mit Wörtern) | frei, ohne Key | **zuverlässiger Fallback**, Open Source |
| 7b | **Genius** | ohne Timing (`plain`) | offizielle API (Key) für Metadaten; der Liedtext selbst nur per Abruf der Songseite (inoffiziell) | dient als **Text-Referenz**: korrigiert Tippfehler/fehlende Zeilen anderer Provider, liefert Abschnitts-Marker (`[Refrain]`, `[Strophe 2: Kai Vento]` → Sänger-Zuordnung bei Feature-Songs) und **Annotations** als Trivia |
| 8 | **Lokale Overrides** (`/data/lyrics/*.lrc|.ttml|.json`) | beliebig | Repo | eigene Korrekturen haben immer Vorrang |

Parser: LRC, Enhanced-LRC (`<mm:ss.xx>` je Wort), TTML (Apple), Richsync-JSON, YRC/QRC → alle in `LyricsDoc`.

**Robustheit der inoffiziellen Quellen:** Jeder Provider hat Timeout (2,5 s), Circuit-Breaker (nach 5 Fehlern 1 h Pause) und einen Health-Status, der in den Einstellungen sichtbar ist. Ein täglicher GitHub-Action-Job prüft jeden Provider mit 3 Referenzsongs und legt bei Ausfall ein Issue an. Die Secrets (`SPOTIFY_SP_DC` usw.) liegen nur in den Vercel-Env-Vars.

> Rechtlicher Hinweis: Lyrics sind urheberrechtlich geschützt, und die inoffiziellen Quellen verstoßen gegen die Nutzungsbedingungen der Anbieter. Sie sind auf ausdrücklichen Wunsch für ein **privates** Dashboard eingebaut. Die Vercel-Instanz wird daher per Login (Spotify-Konto-Allowlist) geschützt, damit die Texte nicht öffentlich abrufbar sind.

### 6.3 Wort-Timing, wenn nur Zeilen-Sync vorliegt

1. **Heuristische Verteilung:** Zeilendauer wird nach Silbenanzahl je Wort verteilt (Silben-Schätzer für DE/EN), kurze Pause vor Satzzeichen.
2. **Verfeinerung per Mikrofon (optional):** die Stimmaktivität (Vocal-Band-Energie 300 Hz–3 kHz + Onsets) schiebt Wortgrenzen auf erkannte Silben-Onsets im Fenster ± 150 ms.
3. UI zeigt die Qualität dezent an (Icon: „W“ = echt Wort-Sync, „~W“ = geschätzt, „L“ = Zeile).

### 6.4 Darstellungsmodi („spannend und abwechselnd“)

Ein **LyricsDirector** wechselt den Modus an Abschnittsgrenzen (Strophe/Refrain), nicht mitten in der Zeile. Refrains werden über **wiederholte Zeilen** erkannt (Textähnlichkeit) und bekommen den auffälligsten Modus.

| Modus | Beschreibung | Einsatz |
|---|---|---|
| **Karaoke-Fill** | Zeile steht, Wörter füllen sich farbig von links nach rechts (Gradient-Clip, ms-genau) | Strophen, Standard |
| **Word-Pop** | Nur aktuelles Wort groß in der Mitte, springt mit leichter Skalierung auf dem Beat herein | schnelle Parts, Rap |
| **Kinetic Stack** | Wörter stapeln sich zeilenweise, unterschiedliche Größen nach Betonung/Länge | Refrain |
| **Typewriter** | Buchstabe für Buchstabe mit Cursor | ruhige Intros/Bridges |
| **Echo/Background** | Background-Vocals (`agent: bg`) kleiner, kursiv, versetzt | wenn TTML-Daten vorhanden |
| **Duett-Split** | Sänger 1 links, Sänger 2 rechts | wenn `agent v1/v2` |
| **3D-Floating** (später) | Worte als 3D-Text in der Szene, Avatare „singen“ (LED-Gesicht) | Highlight-Momente, Stufe 2 |

Gemeinsame Effekte: Farben aus dem Album-Cover (dominante Farbe/Akzent), Glow pulsiert mit Beat-Energie, instrumentale Lücken > 4 s zeigen einen animierten Countdown-Indikator (● ● ●).

---

## 7. Song-Analyse (Mikrofon)

- `getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })` – die Browser-Filter würden Musik verfälschen. Benötigt HTTPS (auf Vercel gegeben). Im Kiosk-Modus wird die Berechtigung einmalig erteilt bzw. per Chrome-Policy freigegeben.
- **AudioWorklet** berechnet pro Frame (~23 ms):
  - FFT-Bänder: Sub-Bass, Bass, Low-Mid, Mid, High, Air
  - RMS-Energie (geglättet, kurz & lang) → **Energy 0–1**
  - Spectral Flux → **Onsets**; Bass-Onsets → **Kick/Beat**
  - **BPM** über Autokorrelation des Onset-Signals (Fenster 8 s, Bereich 70–180 BPM, Oktavfehler-Korrektur) + **Beat-Phase** (PLL), damit Bewegungen auf dem Beat landen
  - Spectral Centroid → „Helligkeit“; Vocal-Band-Aktivität → LED-Gesicht & Wort-Timing
- **Ohne Mikrofon** (oder bei Stille): Fallback auf BPM aus externer Quelle bzw. 120 BPM und Energie-Kurve aus Lyrics-Dichte; App funktioniert vollständig, nur weniger reaktiv.
- **Datenschutz:** Audio wird ausschließlich lokal im Browser verarbeitet, nichts wird aufgezeichnet oder übertragen. Mikro-Indikator in der Kopfzeile.

---

## 8. 3D-Szene & Tanz

### 8.1 DanceDirector

- **Tempo:** Clips sind auf 120 BPM ausgelegt (2 s/4 s = 4/8 Schläge) → `action.timeScale = bpm / 120`, auf 0,6–1,6 begrenzt; bei sehr schnellen Songs Halbtempo.
- **Phase:** Clipwechsel und Loop-Neustarts nur auf **Taktanfang (Downbeat)**, Crossfade 1 Schlag.
- **Clip-Auswahl** nach Energie + Stil:

| Energie | Clips |
|---|---|
| sehr niedrig / Pause | `Idle_Breathe`, `Gesture_Wave` (Songstart/-ende) |
| niedrig | `Dance_FluidArc`, `Dance_SideGlide`, `Dance_JazzRebound`, `Dance_LiquidWave`, `Dance_Waltz` |
| mittel | `Dance_Groove`, `Dance_House`, `Dance_Disco`, `Dance_HeelToe`, `Dance_CrossStep`, `Dance_LatinSway` |
| hoch | `Dance_Techno`, `Dance_Shuffle`, `Dance_FestivalBounce`, `Dance_HipHop`, `Dance_FrontmanDrive` |
| Peaks/Drops | `Dance_PowerHit`, `Dance_Stomp`, `Dance_TurnPhrase`, `Dance_PivotStep` |

- **Stil-Bias** über Spotify-Artist-Genres (falls verfügbar) bzw. Klangprofil: Rock → `RockDrive`/`FrontmanDrive`, Latin → `LatinSway`/`AfroPulse`, Jazz → `JazzSwing`/`JazzRebound`, Elektro → `Techno`/`Robot`/`Shuffle`.
- **Avatar-Casting:** Genre-passende Avatare in die Mitte (z. B. `ember-rock` bei Rock, `velvet-jazz` bei Jazz, `rio-carnival` bei Latin, `neon-pulse`/`quantum-bass` bei Elektro). Standard sind 2–3 Avatare; die Besetzung wechselt bei jedem Song, damit nicht immer dieselben Figuren tanzen.

#### Abwechslung beim Tanzen

Ziel: Auch nach einer Stunde Musik soll es nicht nach Endlosschleife aussehen.
- **Phrasen statt Loops:** Der Clip wechselt alle **8 oder 16 Takte** (zufällig gewichtet) und zusätzlich an jeder Abschnittsgrenze (Strophe → Refrain, Drop, Bridge).
- **Wiederholungssperre:** Ein Clip darf erst wieder kommen, wenn mindestens 4 andere dran waren; pro Song wird eine Clip-Rotation vorab „gewürfelt“ (Seed = Track-ID, also beim selben Song wiedererkennbar, zwischen Songs verschieden).
- **Rollen:** Lead tanzt den Hauptclip, Nebenfiguren eine andere Variante derselben Energiestufe, leicht zeitversetzt (Kanon um ½–1 Takt) oder gespiegelt.
- **Gemeinsame Momente:** Im Refrain und bei Drops tanzen alle **synchron** denselben Clip – der Kontrast macht den Moment.
- **Formationen:** Linie, V-Form, Halbkreis, Solo-Spotlight (Lead vorn, Rest im Halbdunkel), Tausch der Positionen über Lauf-/Seitschritt-Clips (`SideGlide`, `DiagonalStep`, `CrossStep`).
- **Kamera:** langsame Fahrten und Schnitte auf Taktanfang (Totale, halbnah auf Lead, leichte Untersicht im Refrain).
- **Sondermomente:** `Gesture_Wave` beim Songstart/-ende, `PowerHit`/`Stomp` nur auf erkannte Drops, `Idle_Breathe` in längeren Pausen.

#### Feature-Songs: mehrere Tänzer

- **Erkennung:** mehrere Artists im Spotify-Track (`artists.length > 1`) oder Titel mit `feat.`, `ft.`, `featuring`, `with`, `x`, `&`.
- **Ein Avatar pro beteiligtem Artist** (bis zu 5, plus optional 1–2 Background-Tänzer). Jeder Artist bekommt dauerhaft „seinen“ Avatar mit **Namensschild** in der Farbe des Avatars; die Zuordnung wird gespeichert, damit ein Artist bei späteren Songs wieder denselben Avatar bekommt.
- **Wer singt gerade?** Falls die Lyrics Sänger kennzeichnen (TTML-`agent`, Zeilenpräfixe wie `[Artist:]`), tritt der aktive Sänger nach vorn, bekommt das Spotlight, sein LED-Gesicht leuchtet und seine Lyric-Zeile erscheint in seiner Farbe; die anderen tanzen dezenter im Hintergrund. Ohne Kennzeichnung wechselt das Spotlight pro Abschnitt.
- **Performance auf dem Pi:** Bei 4–6 Avataren werden Nebenfiguren mit reduziertem Material und halber Animations-Updaterate gerendert; der Lead bleibt in voller Qualität.
- **LED-Gesicht:** `FaceLedBar0–4` skalieren/leuchten mit Vocal-Aktivität bzw. aktuellem Wort, `FaceLedEye*` blinken auf Beats (über Emissive-Stärke).

### 8.2 Asset-Pipeline

- Build-Skript (`scripts/optimize-avatars.mjs`) mit **gltf-transform**: Dedup, Quantisierung, **Meshopt**-Kompression, Prüfung gegen SHA-256 im Manifest → Ziel < 1,5 MB je Avatar.
- Output nach `/public/avatars`, Manifest wird zu typisiertem Clip-Katalog generiert.
- Lazy Loading: nur die aktuell besetzten Avatare laden, Vorschau-PNG als Platzhalter.

### 8.3 Performance

- Automatische Qualitätsstufen über `PerformanceMonitor` (drei): Anzahl Avatare, Schatten, DPR, Postprocessing.
- `frameloop="always"` nur bei laufender Musik, sonst `demand`.
- Keine React-State-Updates pro Frame – Audio-Werte über Refs/Zustand-`subscribe`.

---

## 9. Qualitätssicherung & GitHub Actions

### 9.1 Workflows

| Workflow | Trigger | Inhalt |
|---|---|---|
| `ci.yml` | Push, PR | `npm ci` → ESLint → `tsc --noEmit` → Vitest (mit Coverage) → `next build` |
| `e2e.yml` | Push, PR | Playwright mit Chromium (Viewport 1280×800 und 1024×600), Spotify & Lyrics über MSW/Route-Mocks, Screenshots als Artefakt + Visual-Regression |
| `codeql.yml` | Push, PR, wöchentlich | CodeQL (JavaScript/TypeScript) |
| `security.yml` | PR, wöchentlich | `npm audit --audit-level=high`, Gitleaks (Secret-Scan), Dependency-Review-Action |
| Dependabot | wöchentlich | npm + GitHub Actions |

Härtung: Actions auf **Commit-SHAs gepinnt**, `permissions: contents: read` als Default, keine Secrets in PR-Workflows von Forks, Branch-Protection auf `main` (alle Checks grün + Review).

### 9.2 Playwright & Screenshots

- Chromium (headless, WebGL über SwiftShader/ANGLE) – identisch zum Kiosk-Browser.
- **Deterministischer Demo-Modus** `/?demo=<fixture>&t=<ms>&seed=1`: feste Songzeit, eingefrorene Animationen, Fake-Audio-Werte → reproduzierbare Screenshots.
- Szenarien: kein Song / Login nötig, Song mit Wort-Sync, Song nur Zeilen-Sync, keine Lyrics, Instrumental-Pause, Refrain-Modus, Duett, Mikro verweigert, Touch-Steuerleiste.
- **Referenz-Screenshots liegen versioniert im Repo** unter **`/playwright/screenshots/<viewport>/<szenario>.png`** und dienen als Basis für `toHaveScreenshot` (Visual-Regression). Jeder CI-Lauf vergleicht dagegen; Abweichungen schlagen fehl und werden mit Diff-Bildern als Artefakt angehängt.
- Referenzbilder werden **im CI-Container erzeugt** (gleiches Linux-Image und gleiche Schriften wie beim Vergleich), damit es keine Pixel-Unterschiede zwischen Rechnern gibt. Aktualisieren über einen manuell startbaren Workflow „Screenshots aktualisieren“, der die neuen Bilder als Commit auf den Branch schreibt; die Änderungen sind dann im PR als Bild-Diff sichtbar.
- Optional: E2E-Smoke gegen jede **Vercel-Preview-URL** (Deployment-Status-Event).

### 9.3 Unit-Tests (Beispiele)

LRC/TTML/Richsync-Parser, Provider-Ranking, Silben-Verteilung, PlaybackClock-Interpolation, BPM-Schätzung mit synthetischen Klicksignalen, Clip-Mapping.

---

## 10. Hosting (Vercel)

- GitHub-Integration: `main` → Production, jeder Branch/PR → Preview.
- Env-Vars: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SESSION_SECRET`, `UPSTASH_REDIS_REST_URL/TOKEN`, Provider-Secrets (`SPOTIFY_SP_DC`, optional `MUSIXMATCH_API_KEY`), Feature-Flags je Provider (`LYRICS_PROVIDERS=musixmatch-desktop,lyricsplus,spotify-color,netease,qq,lrclib`) eine Allowlist erlaubter Spotify-Konten (`ALLOWED_SPOTIFY_USERS`) sowie ab Stufe 5 `LASTFM_API_KEY`, `LASTFM_USER`, `GENIUS_ACCESS_TOKEN`, `FLICKR_API_KEY`, `THEAUDIODB_API_KEY`, `TICKETMASTER_API_KEY`, `BANDSINTOWN_APP_ID`, `SETLISTFM_API_KEY`, `HOME_LOCATION=Wien`, `CONCERT_RADIUS_KM=200` (Konzert-Umkreis). oeticket braucht keinen Key.
- Manche inoffiziellen Quellen sperren Rechenzentrums-IPs wie die von Vercel. Dann laufen diese Anfragen über die Pi-Bridge (private Heim-IP); die Provider-Schnittstelle ist dafür schon ausgelegt.
- Route Handlers im Node-Runtime (Crypto, Parser); Lyrics-Antworten mit `Cache-Control: s-maxage=86400`.
- Security-Header (CSP, `Permissions-Policy: microphone=(self)`), keine Tokens im Client.
- Dashboard-Gerät: Chrome im Kiosk-Modus, z. B.
  `chromium --kiosk --autoplay-policy=no-user-gesture-required https://<projekt>.vercel.app`
  (+ einmalige Mikrofon-Freigabe für die Domain).

---

## 11. Ausbaustufe 2: Bühne & Licht

- **Bühnenmodell:** Podest mit spiegelndem Boden (MeshReflectorMaterial), LED-Rückwand (zeigt Cover/Farbverläufe/Lyrics), Traversen.
- **Lichter:** Moving-Head-Spots (SpotLight + volumetrische Kegel per Additiv-Shader), Wash-Lichter in Cover-Farben, Strobe auf Drops, Laser-Fächer bei hoher Energie, Bodennebel (Partikel/Noise-Shader).
- **Lichtpult-Logik („LightDirector“):** Szenen pro Energie/Abschnitt (Strophe ruhig/warm, Refrain voll, Drop Strobe+Laser), Bewegungen auf Beat-Phase, Farbwechsel auf Taktanfang.
- **Postprocessing:** Bloom, leichte Chromatic Aberration auf Kicks, Vignette.
- Qualitätsstufen beachten: Auf dem Pi werden volumetrische Kegel als einfache Additiv-Meshes gerendert, Bloom nur in halber Auflösung.
- Der LightDirector erzeugt ein geräteunabhängiges Lichtsignal (Farbe, Helligkeit, Akzente pro Beat), das Stufe 3 an echte Lampen weitergibt.

---

## 11a. Ausbaustufe 3: Govee & Alexa

### Pi-Bridge (Voraussetzung)

Kleiner Node-Dienst auf dem Raspberry Pi (systemd), erreichbar nur lokal (`ws://127.0.0.1:8787`). Das Dashboard schickt per WebSocket das Lichtsignal, die Bridge spricht mit den Geräten im Heimnetz. Grund: Der Browser auf Vercel-Seite kann kein UDP senden und keine LAN-Geräte erreichen.

### Govee

| Weg | Latenz | Eignung |
|---|---|---|
| **Govee LAN API** (UDP, lokal, über die Pi-Bridge) | ~20–50 ms | **bevorzugt**: Farbe/Helligkeit auf den Beat, Szenenwechsel pro Takt; LAN-Steuerung muss in der Govee-App je Gerät aktiviert sein |
| **Govee Segment-/Razer-Streaming-Protokoll** (inoffiziell, lokal) | sehr gering | für LED-Strips mit Segmenten: Lauflichter, Spektrum-Anzeige |
| **Govee Cloud API** (Developer-Key) | 0,5–2 s, Rate-Limit | nur Reserve, falls ein Gerät im LAN nicht erreichbar ist |

**Vorhandene Geräte:** H6063, H610B, H61A2 und H6051 – **alle per LAN ansteuerbar** (bestätigt). Damit läuft die komplette Lichtsteuerung lokal über die Pi-Bridge, mit Beat-Puls auf allen vier Geräten. Die Bridge findet die Geräte per Multicast-Discovery (UDP 4001/4002); einmal zugeordnete Geräte werden mit ihrer IP gespeichert. Ob ein Gerät zusätzlich Segment-Streaming beherrscht (für Lauflichter), prüft die Bridge beim Einrichten; sonst wird es mit Farbe und Helligkeit gesteuert.

Die Lichter lesen ihre Daten aus dem Song-Kontext: Grundfarben aus `album.palette`, Akzente aus den Ereignissen `beat`, `chorusStart` und `drop`, Ruhe bei `paused`.

Rollen-Vorschlag (wird beim Einrichten festgelegt): LED-Strip(s) hinter dem Display → Beat-Puls und Lauflicht (Segmente, falls RGBIC); Wand-/Panel-Leuchten → Akzente im Refrain und bei Drops; Tischlampe → ruhige Grundfarbe aus dem Cover.

Funktionen: Grundfarbe aus dem Album-Cover, Puls auf Kick, Farbwechsel im Refrain, Strobe-Akzent bei Drops (mit Helligkeits-/Frequenzgrenze, Fotosensitivitäts-Schutz), Rückfall auf ruhiges Licht, wenn nichts läuft. Geräte werden in den Einstellungen gruppiert (z. B. „Hinter dem Display“, „Decke“).

### Alexa

- **Eigener Alexa-Skill** („Sonic Stage“, Deutsch), Endpunkt als Next.js-Route-Handler auf Vercel, Account-Linking über das Spotify-Login.
- Sprachbefehle (Beispiele): „Alexa, sag Sonic Stage, Party-Modus an“, „… welcher Song läuft?“, „… mehr Tänzer“, „… Lichter aus“, „… zeig Infos zur Band“, „… Lyrics größer“.
- Befehle gelangen in Echtzeit zum Dashboard (Server-Sent Events bzw. Upstash-Redis-Pub/Sub).
- Zusätzlich ein **virtuelles Smart-Home-Gerät** („Party-Modus“ als Schalter), damit Alexa-Routinen das Dashboard auslösen können, z. B. „Alexa, Party!“ → Spotify-Playlist starten + Dashboard-Party-Modus + Govee-Szene.
- Spotify-Wiedergabe auf einem Echo wird ganz normal erkannt, da die App den Spotify-Account abfragt, nicht das Gerät.

---

## 11b. Ausbaustufe 4: Band-Fotos & Infotexte

**Quellen** (serverseitig mit Cache in Redis, 7 Tage):
1. **MusicBrainz** – eindeutige Artist-ID aus Artistname + ISRC, verknüpft mit Wikidata/Wikipedia.
2. **Wikipedia (de, Fallback en)** – REST-Endpunkt `page/summary`: Kurztext, Gründungsjahr, Herkunft; bei englischem Fallback Hinweis „Text aus der englischen Wikipedia“.
3. **Wikimedia Commons / Wikidata** – frei lizenzierte Band-Fotos (mit Urheber- und Lizenzangabe im Bild, wie von CC-BY-SA verlangt).
4. **Spotify-Artist-Bilder** und **TheAudioDB** (Fanart, Banner, Logos) als zusätzliche Bildquellen.
5. Optional **Wikipedia-Artikel zum Album/Song** für Trivia („Erschienen 1997, Platz 1 in Deutschland“).

**Darstellung (abwechselnd, ohne die Lyrics zu verdrängen):**
- **Intro/Outro & Instrumentalteile** (> 8 s ohne Text): Vollbild-Infokarte mit Foto (langsamer Ken-Burns-Zoom), Bandname, 2–3 Sätze Text.
- **Während Strophen:** Fotos laufen auf der LED-Rückwand der Bühne (Stufe 2) oder als gedimmter Hintergrund.
- **Feature-Songs:** kurze Vorstellung jedes beteiligten Artists mit Foto neben „seinem“ Avatar.
- **Fakten-Ticker:** einzelne Kurzfakten blenden zwischen Refrains ein.

---

## 11c. Ausbaustufe 5: Persönliches, Konzerte & weitere Quellen

### Zuletzt gespielte Songs (Last.fm)

- **Last.fm API** (`user.getRecentTracks`, API-Key + Benutzername, kein OAuth nötig für Lesezugriff); Fallback: Spotify „Recently Played“. Das Last.fm-Profil ist vorhanden; der Benutzername wird als Env-Var `LASTFM_USER` gesetzt (nicht im Code).
- Anzeige: Leiste „Zuletzt gehört“ (Cover, Titel, „vor 12 Min.“) im Startbildschirm, wenn nichts läuft, und als einblendbare Seitenleiste per Wischgeste. Echtzeit-Scrobbles (gerade laufender Song) werden erkannt und nicht doppelt gezeigt.
- Zusätzlich aus Last.fm: Hörstatistik („Du hast diesen Song 37-mal gehört“, „Künstler seit 2019 in deiner Bibliothek“), Tags, ähnliche Künstler.

### Gefällt mir: Song und Künstler

Ein dezentes Symbol-Cluster in der Kopfzeile, Daten im Song-Kontext unter `user`:

| Symbol | Bedeutung | Quelle |
|---|---|---|
| ♥ gefüllt | Song in deinen Spotify-Lieblingssongs | Spotify Bibliothek (`user-library-read`) |
| ♥ mit Last.fm-Punkt | Song auf Last.fm „geliebt“ | Last.fm `track.getInfo` (`userloved`) |
| ★ Künstler | du folgst dem Künstler | Spotify (`user-follow-read`) |
| Zahl | Wiedergaben des Songs / des Künstlers | Last.fm `userplaycount` |

Bei Feature-Songs gilt der Stern pro Artist und erscheint am Namensschild des jeweiligen Avatars. Ein gelikter Künstler bekommt beim Songstart ein kurzes Highlight (Avatar winkt mit `Gesture_Wave`, Lichtakzent). Optional später per Touch: Song liken/entliken (`user-library-modify`).

### Bevorstehende Konzerte

**Provider** (parallel abgefragt, Ergebnisse zusammengeführt):

| Provider | Zugang | Stärke |
|---|---|---|
| **Ticketmaster Discovery API** | kostenloser API-Key | große Abdeckung in DE/EU, Ticket-Links, Ausverkauft-Status |
| **Bandsintown** | App-ID (Nutzung mit Quellenangabe) | sehr gute Abdeckung kleiner/mittlerer Acts, Tourdaten direkt von Künstlern |
| **Songkick** | API nur noch für Partner | aufgenommen, sobald ein Key vorliegt |
| **setlist.fm** | kostenloser API-Key | keine Zukunftstermine, aber „Was spielen sie gerade auf Tour?“ (letzte Setlists) |
| **oeticket (Eventim Österreich)** | inoffizielle Eventim-Such-API, kein Key | **wichtigste Quelle für Österreich**; liefert Termine, Locations, Preise und Ticket-Links direkt von oeticket |
| **Eventim / Reservix (DE)** | gleiche API mit anderem `webId`/Partner | optional für Konzerte in Deutschland |

**oeticket-Anbindung (inoffiziell):**

```
GET https://public-api.eventim.com/websearch/search/api/exploration/v1/products
    ?webId=web__oeticket-at&language=de&retail_partner=EOE
    &page=1&top=50&sort=DateAsc
    &search_term=<Künstlername>        # z. B. Paul+van+Dyk
    [&city_names=<Stadt>]              # z. B. Linz – optional, mehrfach für mehrere Städte
```

- Abfrage pro Künstler mit `search_term`; Treffer werden gegen den Künstlernamen geprüft (Volltextsuche liefert auch Tribute-Bands, Partyreihen „… Night“ usw.), Paginierung über `page`, bis keine Treffer mehr kommen oder 3 Seiten erreicht sind.
- Antwort wird per zod validiert; ändert sich das Format, schlägt der tägliche Provider-Check (GitHub Action) an und der Provider pausiert automatisch, die anderen Quellen laufen weiter.
- Läuft serverseitig (Vercel) mit 12-h-Cache und höchstens einer Anfrage pro Künstler und Tag, um die inoffizielle Schnittstelle zu schonen; bei Sperre der Vercel-IP über die Pi-Bridge.

- **Zusammenführung:** Termine werden über Künstler (MusicBrainz-ID), Datum und Ort/Venue (normalisiert) dedupliziert; jede Quelle bleibt als Herkunft sichtbar, Ticket-Link vom zuverlässigsten Anbieter.
- **Relevanz:** Heimatort **Wien**, Standard-Umkreis **200 km** (umfasst u. a. Wien, Bratislava, Brünn, Graz, Linz, St. Pölten). Termine im Umkreis zuerst, danach restliches Österreich, dann Europa. Umkreis in den Einstellungen änderbar. Die Entfernung wird aus den Koordinaten der Location berechnet (falls die Quelle keine liefert: Geocoding der Stadt, gecacht).
- **Anzeige:** Karte „Live in deiner Nähe“ (Datum, Stadt, Location, Countdown „in 23 Tagen“, *ausverkauft*-Hinweis) in Instrumentalteilen, im Outro und im Infobereich. Ticket-Link als **QR-Code**, damit er aufs Handy wandert. Bei Feature-Songs pro Artist.
- **Cache:** 12 h pro Künstler (Redis), Rate-Limits je Provider beachtet.

### Weitere Quellen für Infos & Fotos

| Quelle | Wofür |
|---|---|
| **MusicBrainz** | eindeutige Künstler-ID (Schlüssel für alle anderen Quellen), Mitglieder, Gründungsjahr, Herkunft, Diskografie |
| **TheAudioDB** | Künstler-Fotos, Fanart, Banner, Logos, Biografie (auch deutsch) |
| **Flickr API** | Konzertfotos; Suche nach Künstlername + Tags, **nur frei lizenzierte Fotos** (CC-Lizenzfilter) mit Urheberangabe |
| **Wikimedia Commons / Wikipedia** | wie in Stufe 4 |
| **Genius** | Song-Hintergründe (Annotations) als Trivia, Abschnitts-Marker für Lyrics |
| **Last.fm** | Tags, ähnliche Künstler, Hörstatistik |

Ein **Foto-Ranking** wählt pro Künstler die besten Bilder (Auflösung, Seitenverhältnis passend zum Display, Lizenz, Aktualität) und wechselt sie im Song ab; Logos von TheAudioDB können als Bühnenprojektion genutzt werden (Stufe 2).

## 12. Umsetzungsplan (Meilensteine)

Erledigt: **M1** (Projektgerüst, Song-Kontext), **M2** (Spotify), **M3** (Lyrics-Grundlage mit LRCLIB), **M4** (3D-Szene mit Tanz-Regie), **M5** (Mikrofon-Analyse), **M6** (Wort-für-Wort-Provider, Lyrics-Modi).

Befund M6 (Nov. 2026, gegen echte Schnittstellen geprüft): NetEase liefert Wort-Sync; Musixmatch Desktop nur Zeilen-Sync über `macro.subtitles.get` (`matcher.track.get` und `track.richsync.get` existieren dort nicht) und aus Rechenzentren falsche Treffer; der Community-Dienst „lyricsplus“ ist abgeschaltet; QQ Music liefert Wort-Sync nur verschlüsselt (QRC) und wurde ausgelassen.

| # | Meilenstein | Ergebnis |
|---|---|---|
| M1 | Projekt-Setup | Next.js + TS + Tailwind, Lint/Format, CI-Workflow, Vercel verbunden, Avatar-Optimierung, **Song-Kontext-Schema + Store + Demo-Fixtures** |
| M2 | Spotify | Login (PKCE), Now-Playing-Anzeige, PlaybackClock, Steuerleiste |
| M3 | Lyrics | Datenmodell, Parser, LRCLIB + lokale Overrides, Karaoke-Fill-Modus, Offset-Regler |
| M4 | 3D-Szene | R3F-Szene, 3 Avatare, Clip-Katalog, Tanz auf festem Tempo |
| M5 | Audio-Analyse | Mikrofon, Beat/BPM/Energie, DanceDirector reagiert live, LED-Gesichter |
| M6 | Lyrics-Ausbau | weitere Provider (Musixmatch/Apple per Key, opt-in-Quellen), Wort-Schätzung + Mikro-Verfeinerung, alle Darstellungsmodi, LyricsDirector |
| M7 | QA | Playwright-Szenarien, Screenshots, Visual-Regression, CodeQL/Gitleaks/Dependabot, Branch-Protection |
| M8 | Stufe 2 | Bühne, LightDirector, Postprocessing |
| M9 | Stufe 3a | Pi-Bridge, Govee LAN/Segment-Steuerung |
| M10 | Stufe 3b | Alexa-Skill, Echtzeit-Kanal, virtuelles Smart-Home-Gerät |
| M11 | Stufe 4 | MusicBrainz/Wikipedia/Commons-Anbindung, Infokarten, Fotos auf der LED-Wand |
| M12 | Stufe 5a | Last.fm (zuletzt gespielt, Hörstatistik), Likes/Follows im HUD |
| M13 | Stufe 5b | Konzert-Provider (Ticketmaster, Bandsintown, setlist.fm), Zusammenführung, Konzertkarte mit QR-Code |
| M14 | Stufe 5c | Flickr, TheAudioDB, Genius (Trivia, Text-Referenz), Foto-Ranking |

---

## 13. Offene Fragen

1. **Rechner:** Raspberry Pi 5 (8 GB) oder N100-Mini-PC? Beides wird unterstützt; die Entscheidung hat nur Einfluss auf die Standard-Qualitätsstufe.

3. **Last.fm:** Scrobbelt Spotify bereits zu Last.fm? (Sonst fehlen dort die aktuellen Songs; Fallback ist Spotify „Recently Played“.)

### Geklärt
- Raspberry Pi, Chromium im Kiosk-Modus · Spotify-Developer-App + Premium vorhanden · kein Apple-Developer-Zugang · inoffizielle Lyrics-Quellen erwünscht (Referenz: `simonroedig/SpotifyLyrics`) · Oberfläche nur Deutsch · Feature-Songs mit mehreren Tänzern, viel Abwechslung beim Tanzen · spätere Stufen: Govee, Alexa, Band-Fotos und Wikipedia-Texte · Mikrofon vorhanden · Referenzformat 1280×800 · Referenz-Screenshots im Repo · Govee-Geräte H6063, H610B, H61A2, H6051 alle per LAN ansteuerbar · zentraler Song-Kontext als Architektur-Kern · Last.fm-Profil vorhanden · Konzerte: Heimatort Wien, Umkreis 200 km, oeticket über die inoffizielle Eventim-API.
