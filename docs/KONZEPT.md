# Konzept: „Sonic Stage“ – Lyric-Dashboard (10 Zoll)

Stand: 2026-11-14 · Status: Entwurf zur Abstimmung

---

## 1. Ziel

Eine Web-App (Next.js/React), die auf einem 10-Zoll-Dashboard im Vollbild läuft und

1. den **aktuell auf Spotify laufenden Song** anzeigt (Cover, Titel, Artist, Fortschritt),
2. die **Lyrics synchron, möglichst Wort für Wort**, in wechselnden, spannenden Darstellungen einblendet,
3. **3D-Avatare (Three.js)** zeigt, die **passend zum Song tanzen** (Tempo, Energie, Stil),
4. den Song **live über das Mikrofon analysiert** (Beat, BPM, Energie, Frequenzbänder),
5. über **Vercel** gehostet und über **GitHub Actions** abgesichert wird (Lint, Typen, Tests, Playwright-Screenshots, Security-Scans).

Ausbaustufe 2: **Bühne mit Lichteffekten** (Spots, Lichtkegel, Laser, Nebel, Bloom), beat-synchron.

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

**Annahme** (bitte bestätigen, siehe Abschnitt 13): 10-Zoll-Display im Querformat, **1280×800** (16:10), Touch, Chrome/Chromium im Kiosk-Modus. Zweites Profil für **1024×600** wird mitgetestet.

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

```
┌─────────────────────────── Browser (Dashboard) ───────────────────────────┐
│                                                                           │
│  NowPlaying-Sync ──► PlaybackClock (interpolierte Songzeit, ms-genau)     │
│        │                     │                                            │
│        │                     ├──► LyricsEngine ──► LyricsRenderer (DOM)   │
│        │                     │                                            │
│  Mikrofon ──► AudioAnalyzer (AudioWorklet/FFT)                            │
│                  │  beat, bpm, energy, bands, vocalActivity               │
│                  ▼                                                        │
│            MusicState (Zustand-Store) ──► DanceDirector ──► R3F-Szene     │
│                                              (Clip-Wahl, Tempo, Crossfade)│
└───────────────────────────────▲───────────────────────────────────────────┘
                                │ fetch (JSON)
┌───────────────────────────────┴──── Vercel (Next.js Route Handlers) ──────┐
│ /api/auth/*        Spotify OAuth (PKCE), Refresh-Token im verschl. Cookie │
│ /api/now-playing   Proxy auf Spotify „currently-playing“                  │
│ /api/lyrics        Provider-Kette, Normalisierung, Cache (Redis/Upstash)  │
│ /api/track-meta    BPM/Genre-Anreicherung (optional, externe Quellen)     │
└───────────────────────────────────────────────────────────────────────────┘
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
  /api/lyrics/route.ts
/components
  /stage       Scene.tsx, Avatar.tsx, DanceDirector.ts, (Stufe 2: Lights.tsx)
  /lyrics      LyricsLayer.tsx, modes/*.tsx
  /hud         NowPlayingBar.tsx, Controls.tsx, Progress.tsx
/lib
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

- **OAuth Authorization Code + PKCE** über eigene Spotify-Developer-App. Scopes: `user-read-currently-playing`, `user-read-playback-state`, optional `user-modify-playback-state` (Steuerleiste).
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
| 1 | **Musixmatch (Richsync)** | Wort | offizielle API, kostenpflichtiger Key | rechtlich sauberste Wort-für-Wort-Quelle; aktivierbar, sobald ein Key vorliegt |
| 2 | **Apple Music (TTML, Silben-/Wort-Sync)** | Wort | MusicKit-Developer-Token + Apple-Music-Abo | sehr gute Qualität inkl. Duett/Background; nur mit Apple-Developer-Account |
| 3 | **Community-Aggregatoren (z. B. „Lyrics+“-artige APIs)** | Wort/Zeile | offen | Verfügbarkeit schwankt, Rechtslage unklar → **opt-in per Env-Flag**, nur Privatnutzung |
| 4 | **NetEase (YRC) / QQ Music (QRC)** | Wort | inoffiziell | stark bei asiatischem Repertoire, inoffiziell → **opt-in** |
| 5 | **LRCLIB** | Zeile (teils Enhanced-LRC mit Wörtern) | frei, ohne Key | **Standard-Fallback**, zuverlässig, Open Source |
| 6 | **Lokale Overrides** (`/data/lyrics/*.lrc|.ttml|.json`) | beliebig | Repo | eigene Korrekturen haben immer Vorrang |

Parser: LRC, Enhanced-LRC (`<mm:ss.xx>` je Wort), TTML (Apple), Richsync-JSON, YRC/QRC → alle in `LyricsDoc`.

> Rechtlicher Hinweis: Lyrics sind urheberrechtlich geschützt. Standardmäßig sind nur LRCLIB, lokale Dateien und offizielle Keys aktiv. Inoffizielle Quellen werden nicht standardmäßig aktiviert. Nutzung auf einem privaten Dashboard; keine öffentliche Weiterverbreitung der Texte.

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
- **Avatar-Casting:** Genre-passende Avatare in die Mitte (z. B. `ember-rock` bei Rock, `velvet-jazz` bei Jazz, `rio-carnival` bei Latin, `neon-pulse`/`quantum-bass` bei Elektro). 3 Avatare Standard, bis zu 5 auf starker Hardware; Aufstellung wechselt beim Songwechsel.
- **Choreo-Variation:** Avatare nicht synchron identisch – Lead tanzt den Hauptclip, Nebenfiguren Varianten derselben Energiestufe, im Refrain alle synchron (Gänsehaut-Moment).
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
- Screenshots werden unter **`/playwright/screenshots/<viewport>/<szenario>.png`** abgelegt; Referenzbilder für `toHaveScreenshot` liegen versioniert im Repo, aktuelle Läufe zusätzlich als CI-Artefakt (Diff-Bilder bei Abweichung).
- Optional: E2E-Smoke gegen jede **Vercel-Preview-URL** (Deployment-Status-Event).

### 9.3 Unit-Tests (Beispiele)

LRC/TTML/Richsync-Parser, Provider-Ranking, Silben-Verteilung, PlaybackClock-Interpolation, BPM-Schätzung mit synthetischen Klicksignalen, Clip-Mapping.

---

## 10. Hosting (Vercel)

- GitHub-Integration: `main` → Production, jeder Branch/PR → Preview.
- Env-Vars: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SESSION_SECRET`, `UPSTASH_REDIS_REST_URL/TOKEN`, optionale Provider-Keys (`MUSIXMATCH_API_KEY`, `APPLE_MUSIC_*`) und Feature-Flags (`LYRICS_ENABLE_UNOFFICIAL=false`).
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
- **Optional:** Ausgabe der Lichtszenen an echte Lampen (z. B. Philips Hue Entertainment / WLED) – eigenes Modul.
- Qualitätsstufen beachten: volumetrische Effekte nur auf ausreichend starker Hardware.

---

## 12. Umsetzungsplan (Meilensteine)

| # | Meilenstein | Ergebnis |
|---|---|---|
| M1 | Projekt-Setup | Next.js + TS + Tailwind, Lint/Format, CI-Workflow, Vercel verbunden, Avatar-Optimierung |
| M2 | Spotify | Login (PKCE), Now-Playing-Anzeige, PlaybackClock, Steuerleiste |
| M3 | Lyrics | Datenmodell, Parser, LRCLIB + lokale Overrides, Karaoke-Fill-Modus, Offset-Regler |
| M4 | 3D-Szene | R3F-Szene, 3 Avatare, Clip-Katalog, Tanz auf festem Tempo |
| M5 | Audio-Analyse | Mikrofon, Beat/BPM/Energie, DanceDirector reagiert live, LED-Gesichter |
| M6 | Lyrics-Ausbau | weitere Provider (Musixmatch/Apple per Key, opt-in-Quellen), Wort-Schätzung + Mikro-Verfeinerung, alle Darstellungsmodi, LyricsDirector |
| M7 | QA | Playwright-Szenarien, Screenshots, Visual-Regression, CodeQL/Gitleaks/Dependabot, Branch-Protection |
| M8 | Stufe 2 | Bühne, LightDirector, Postprocessing |

---

## 13. Offene Fragen

1. **Gerät:** Welches 10-Zoll-Display genau (Auflösung, Tablet oder Monitor an Raspberry Pi/Mini-PC)? Davon hängen Avatar-Anzahl und Effektstufe ab.
2. **Browser:** Chrome/Chromium im Kiosk-Modus möglich? (Android-Tablet, iPad und Pi verhalten sich bei Mikrofon/WebGL unterschiedlich.)
3. **Spotify-Developer-App:** Vorhanden oder soll ich die Einrichtung dokumentieren? Premium-Account (für Steuerung nötig)?
4. **Lyrics-Provider:** Gibt es einen Musixmatch-Key oder Apple-Developer-Account? Sollen inoffizielle Wort-Sync-Quellen (opt-in, nur privat) überhaupt eingebaut werden?
5. **Mikrofon:** Steht das Dashboard nahe am Lautsprecher? (Bestimmt die Kalibrierung.)
6. **Sprache der UI:** Deutsch, Englisch oder beides?
7. **Screenshots:** Sollen die Referenz-Screenshots im Repo versioniert werden (empfohlen) oder nur als CI-Artefakte?
