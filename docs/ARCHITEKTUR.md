# Architektur-Bewertung „Sonic Stage“

Stand: 2026-11-14, nach Meilenstein 8 (Bühne & Licht). Ergänzt `docs/KONZEPT.md` um den tatsächlichen Ist-Stand.

## 1. Ist-Architektur

```
Browser (Dashboard, Next.js App Router, React 19)
├─ Quellen (schreiben in den Song-Kontext)
│  ├─ useSpotifySync      /api/now-playing → songFromTrack() → setSong / setPlayback (Uhr-Abgleich)
│  ├─ useLyricsLoader     /api/lyrics → mergeSong({ lyrics }) (mit Neuversuchen)
│  ├─ useMicAnalysis      Web Audio → Beat/Tempo/Energie/Drops → setLive
│  └─ Cover-Palette       extractPalette() → mergeSong({ album.palette })
├─ SONG-KONTEXT           lib/song-context (zod-Schema, Zustand-Store, Ereignisse, derive())
└─ Verbraucher (lesen nur)
   ├─ HUD, Steuerleiste, Debug-Panel
   ├─ LyricsLayer        ← LyricsDirector (Modus je Abschnitt)
   └─ Stage (R3F)        ← DanceDirector (Choreografie-Plan) + LightDirector (Lichtszenen)

Server (Vercel Route Handlers)
├─ /api/auth/*           OAuth + PKCE, Session AES-256-GCM im httpOnly-Cookie, Single-Flight-Refresh
├─ /api/now-playing      Spotify „currently playing“ (zod, tolerant gegenüber entfernten Feldern)
├─ /api/player/[action]  Steuerung (403 im Entwicklungsmodus verständlich gemeldet)
└─ /api/lyrics           Provider-Kette → Cache (Upstash/Speicher), eigene Korrekturen ohne Cache
```

**Leitprinzip:** Fachlogik liegt in reinen, deterministischen Funktionen (`lib/`): Choreografie, Licht,
Abschnitte, Lyrics-Modi, Tempo, Parser. React/Three.js setzen nur um. Dadurch sind Screenshots
reproduzierbar (gleiche Songzeit → gleiche Pose, gleiches Licht) und die Logik ist mit Unit-Tests abgedeckt.

## 2. Bewertung

### Stärken

| Bereich | Bewertung |
|---|---|
| Song-Kontext als einzige Quelle der Wahrheit | trägt: alle Module lesen aus einem Ort, Ereignisse statt nachgebauter Bedingungen, Debug-Panel zeigt alles |
| Deterministische Regie (Tanz, Licht, Lyrics) | sehr gut testbar, Demo-Modus mit eingefrorener Zeit, keine Zufallsabhängigkeit zur Laufzeit |
| Frame-Updates ohne React-Rerender | Songzeit, Wort-Füllung, Licht laufen über Refs/`subscribe` – wichtig für den Pi |
| Provider-Kette | parallel, Timeout, Circuit-Breaker, Treffer-Prüfung gegen Lockvogel-Antworten, Ranking |
| Sicherheit | Tokens nie im Browser, verschlüsseltes Cookie, CSP, Konto-Allowlist, Secret-Scan, CodeQL, gepinnte Actions |
| Qualitätsstufen | eine Codebasis für Pi 4 bis Mini-PC, automatische Anpassung |

### Gefundene Schwächen und Status

| # | Schwäche | Risiko | Status |
|---|---|---|---|
| 1 | Gleichzeitige Token-Erneuerung: Spotify rotiert bei PKCE das Refresh-Token, zwei parallele Erneuerungen machen die Anmeldung ungültig | hoch (Dashboard „fliegt raus“) | **behoben:** Single-Flight je Refresh-Token, Ergebnis 60 s wiederverwendbar |
| 2 | Ein Ladefehler eines Avatars oder fehlendes WebGL bringt die ganze Seite zum Absturz | hoch (Kiosk zeigt Fehlerseite) | **behoben:** Fehlergrenzen je Avatar und für die Szene, 2D-Ersatzhintergrund, Neuaufbau nach Verlust des Grafikkontexts |
| 3 | Lyrics bleiben nach einem Netzwerkfehler für den ganzen Song weg; „alle Provider im Timeout“ wurde als „keine Lyrics“ angezeigt | mittel | **behoben:** Neuversuche nach 10/30/90 s, vorübergehende Fehlschläge werden erkannt |
| 4 | Lyrics-Cache ignoriert Änderungen der Provider-Konfiguration („nicht gefunden“ bleibt 24 h, auch wenn sp_dc neu gesetzt wird) | niedrig | **behoben:** Provider-Konfiguration im Cache-Schlüssel |
| 5 | LED-Gesichter bleiben nach dem Abschalten des Mikros in der letzten Stellung | niedrig | **behoben** |
| 6 | Server-Schicht kaum getestet (0–34 %) | mittel | **behoben:** Tests für Token-Erneuerung, Routen-Rahmen, Lyrics-Service, Einstellungen |
| 7 | `Stage.tsx` bündelte Szene, Regie, Avatare, Bereitschafts-Signal | Wartbarkeit | **behoben:** aufgeteilt in `Stage`, `Director`, `Avatar`, `ReadySignal`, `types` |
| 8 | Keine einheitliche Formatierung | Wartbarkeit | **behoben:** Prettier + Prüfung in der CI |
| 9 | Song-Kontext wird im Browser zusammengesetzt; ein serverseitiger Stand fehlte | mittel – Alexa braucht einen serverseitigen Stand | **behoben (Stufe 3):** Schnappschuss über `/api/song-context`, Befehle in der Antwort. Die Zusammensetzung bleibt bewusst im Browser (beat-genaue Daten entstehen dort) |
| 10 | Circuit-Breaker und Speicher-Cache leben pro Serverless-Instanz | niedrig | **offen:** mit Upstash ist der Lyrics-Cache geteilt; der Breaker dient nur dem Schutz vor Dauerfehlern |
| 11 | Konto-Allowlist ist optional | niedrig (Spotify-Entwicklungsmodus begrenzt ohnehin die Nutzer) | **offen:** `ALLOWED_SPOTIFY_USERS` in Production setzen (README) |
| 12 | Leistung auf echter Pi-Hardware nicht gemessen | mittel | **offen:** erst mit Gerät messbar; „Auto“ regelt herunter |

## 3. Qualitätssicherung

| | vorher | jetzt |
|---|---|---|
| Unit-Tests | 132 | 143 |
| Abdeckung `lib/` (Anweisungen / Verzweigungen / Funktionen / Zeilen) | 83 / 77 / 82 / – % | 91 / 82 / 88 / 93 % |
| Mindest-Abdeckung in der CI | – | 88 / 78 / 85 / 90 % |
| E2E-Tests (je Auflösung) | 37 | 39 (+ ohne WebGL, + Avatar lädt nicht) |
| E2E-Laufzeit | ein Job, ~7–8 min | drei parallele Jobs (je Auflösung) |

**Workflows:**

| Workflow | Änderung |
|---|---|
| `ci.yml` | + Prettier-Prüfung, Abdeckung mit Schwellwerten, Abdeckung als Job-Zusammenfassung und Artefakt, Next.js-Build-Cache |
| `e2e.yml` | Matrix je Auflösung (parallel), Build-Cache, manuell startbar |
| `update-screenshots.yml` | startet danach automatisch den E2E-Lauf (Bot-Commits lösen sonst keine Workflows aus) |
| `workflows-lint.yml` | neu: `actionlint` prüft alle Workflows bei Änderungen |

**Referenz-Screenshots** sind maßgeblich aus dem CI-Container (`mcr.microsoft.com/playwright:v1.63.0-noble`).
Lokal können einzelne Bilder (vor allem 1024×600 mit Bloom) leicht abweichen; neue Referenzen immer über den
Workflow „Screenshots aktualisieren“ erzeugen.

## 4. Empfehlungen für die nächsten Stufen

1. ~~**Serverseitiger Song-Kontext-Schnappschuss (vor Stufe 3):**~~ umgesetzt – `/api/song-context` speichert pro Nutzer den
   kompakten Stand (Track, Artists, Abschnitt, Palette, Lichtsignal) in Upstash. Alexa („Welcher Song läuft?“)
   und die Pi-Bridge lesen daraus. Der Browser bleibt Quelle für beat-genaue Daten (WebSocket zur Pi-Bridge).
2. **Upstash in Production aktivieren:** geteilter Lyrics-Cache über alle Serverless-Instanzen, Grundlage für 1.
3. **Leistungsmessung auf dem Pi:** Bildrate je Qualitätsstufe protokollieren (Debug-Panel), Voreinstellung danach festlegen.
4. **Echte Daten statt Mocks prüfen:** Spotify-Steuerung (403 im Entwicklungsmodus?) und Color-Lyrics mit dem
   Anmelde-Token sind nur gegen nachgebildete Antworten getestet.
