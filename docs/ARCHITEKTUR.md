# Architektur-Bewertung „Sonic Stage“

Stand: 2026-11-15, nach Stufe 5 (inkl. Better Lyrics, Umschrift/Übersetzung). Ergänzt `docs/KONZEPT.md` (v3) um die
technische Bewertung. Abschnitt 1 zeigt den Kern; die vollständige Liste der Quellen und Routen steht im Konzept, Abschnitt 4.

## 1. Ist-Architektur

```
Browser (Dashboard, Next.js App Router, React 19)
├─ Quellen (schreiben in den Song-Kontext)
│  ├─ useSpotifySync      /api/now-playing → songFromTrack() → setSong / setPlayback (Uhr-Abgleich)
│  ├─ useLyricsLoader     /api/lyrics → mergeSong({ lyrics }) (mit Neuversuchen)
│  ├─ useMicAnalysis      Web Audio → Beat/Tempo/Energie/Drops → setLive
│  ├─ useInfoLoader / useUserLoader / useConcertLoader   Infos, Persönliches, Konzerte → mergeSong
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
├─ /api/lyrics           Provider-Kette → Cache (Upstash/Speicher), eigene Korrekturen ohne Cache
├─ /api/info, /api/personal, /api/recent, /api/concerts   Anreicherung, je Quelle gecacht
├─ /api/song-context     Schnappschuss für Alexa, Befehlskanal
└─ /api/alexa            Alexa-Skill (Signaturprüfung)

Pi (lokal): bridge/ – WebSocket vom Browser, Govee per LAN/UDP
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
| 13 | Kein Watchdog, keine Fehlermeldungen vom Kiosk | mittel (Bildschirm bleibt bei Hängern stehen, Fehler unbemerkt) | **behoben:** Watchdog in der Pi-Bridge, Kiosk-Protokoll mit Leistungsproben |
| 18 | Avatar-Adressen ohne Version bei einem Jahr „immutable“-Cache | mittel (Avatar-Updates kämen ein Jahr nicht an) | **behoben:** Prüfsumme als Version in der Adresse |
| 14 | Lyrics-Cache-Schlüssel enthält die Provider-Liste | niedrig (jede Provider-Änderung lädt alle Songs einmal neu) | **behoben:** Treffer unabhängig von der Provider-Liste; „nicht gefunden“ und Treffer ohne Wort-Sync werden nach einer Änderung einmal neu geprüft; alte Einträge werden übernommen |
| 15 | `LyricsLayer.tsx` über 300 Zeilen | Wartbarkeit | **behoben:** Modi in `components/lyrics/modes/`, Gemeinsames in `shared.tsx` (Umbau pixelgleich geprüft) |
| 16 | Sporadischer Testfehler (Chiffrat enthielt zufällig „u1“) | niedrig | **behoben:** langer, eindeutiger Klartext im Test |
| 17 | TTML: Silben, Duett-Typen, `lrc:`-Namensraum, lose Satzzeichen | mittel (falsche Füllung, fehlende Sänger) | **behoben:** Parser gegen echte Antworten geprüft |

### Sicherheitsprüfung der neuen Schnittstellen (2026-11-20)

Geprüft: `/api/remote`, `/api/commands`, `/api/song-memory`, `/api/prefs` (Avatare, Ruhezeit), `/api/show/trace`,
`/api/debug-context`, `/api/log` (inkl. Löschen) und die Pi-Bridge-Nachricht `display`.

| Punkt | Ergebnis |
|---|---|
| Anmeldung | jeder Handler prüft die Sitzung; Daten liegen je Spotify-Konto (`…:${uid}`) |
| Eingaben | zod mit festen Grenzen (Befehle als Aufzählung, Versatz ±2 s, Drops ≤ 64, Energieverlauf ≤ 720 Werte, Avatare ≤ 100, Debug-Kontext ≤ 900 kB) |
| Fremde Seiten (CSRF) | Sitzungs-Cookie `SameSite=Lax`: schreibende Anfragen von fremden Seiten kommen ohne Anmeldung an; `*.vercel.app` steht auf der Public-Suffix-Liste |
| Ausgabe | nur über React (kein `dangerouslySetInnerHTML`), CSP unverändert |
| Missbrauch | Befehlswarteschlange höchstens 20 Einträge, 5 min gültig; schneller Abruf nur solange die Fernbedienung sich meldet |
| Bridge | nur `127.0.0.1`, nur erlaubte Herkunft, Nachrichten ≤ 4 kB; Bildschirmbefehle stehen in der lokalen `config.json`, nicht in der Nachricht |
| Abhängigkeiten | `npm audit --omit=dev`: 0 bekannte Schwachstellen |
| Lyrics-Provider | Spotify Color-Lyrics mit Circuit-Breaker: bei Ablehnung/Drosselung 15 min Pause, Status unter `/debug` (`/api/lyrics-status`) |
| Spotify Canvas | optionales Loop-Video statt der 3D-Bühne (Geräte-Einstellung „Canvas“); gleiches Web-Player-Token wie die Lyrics (`lib/spotify/web-token.ts`), eigener Protobuf-Abruf, selber Circuit-Breaker; `/api/canvas`, Vorschau `?canvas=<url>` |

Ergebnis: kein Handlungsbedarf.

## 3. Qualitätssicherung

| | Meilenstein 8 | jetzt (Stufe 5+) |
|---|---|---|
| Unit-Tests | 143 | 263 |
| Abdeckung (Anweisungen / Verzweigungen / Funktionen / Zeilen) | 91 / 82 / 88 / 93 % | 91 / 82 / 88 / 94 % |
| Mindest-Abdeckung in der CI | 88 / 78 / 85 / 90 % | unverändert |
| E2E-Tests (je Auflösung) | 39 | 54 (+ 18 Leistungsbudgets bei 1280×800) |
| E2E-Laufzeit | drei parallele Jobs | unverändert, ~3–4 min gesamt |
| Live-Checks echter Dienste (täglich) | Lyrics | + Info-Quellen, Konzerte, Better Lyrics |

**Workflows:**

| Workflow | Änderung |
|---|---|
| `ci.yml` | + Prettier-Prüfung, Abdeckung mit Schwellwerten, Abdeckung als Job-Zusammenfassung und Artefakt, Next.js-Build-Cache |
| `e2e.yml` | Matrix je Auflösung, große Auflösungen in Shards (1 + 3 + 4 Jobs), Gesamtergebnis „E2E gesamt“, Build-Cache, manuell startbar; „Screenshots aktualisieren“ verteilt genauso und committet die geänderten Bilder in einem Schritt |
| `update-screenshots.yml` | startet danach automatisch den E2E-Lauf (Bot-Commits lösen sonst keine Workflows aus) |
| `workflows-lint.yml` | neu: `actionlint` prüft alle Workflows bei Änderungen |

**Leistungswächter** (`playwright/tests/render-budget.spec.ts`, nur 1280×800): Die Bühne meldet am Canvas die höchsten
Zeichenaufrufe und Dreiecke seit dem Laden (`data-drawcalls`, `data-triangles`). Der Test lädt jedes Bühnen-Thema in
Qualität „niedrig“ und „mittel“ und vergleicht mit `render-budget.json` (gemessen + 25 % Zeichenaufrufe, + 50 %
Dreiecke). Wer die Bühne bewusst aufwendiger macht, misst neu und hebt das Budget im selben Commit an.

Befunde der ersten Messung: In „mittel“ kosten Club, Festival und Stadion etwa das Dreifache von „niedrig“
(270–300 Zeichenaufrufe, bis ~800 000 Dreiecke) – die Kamera-Bildschirme zeichnen die Szene ein zweites Mal. Die
Kathedrale braucht schon in „niedrig“ ~140 Zeichenaufrufe (viele Einzelteile) – Kandidat für Instancing.

**Referenz-Screenshots** sind maßgeblich aus dem CI-Container (`mcr.microsoft.com/playwright:v1.63.0-noble`).
Lokal können einzelne Bilder (vor allem 1024×600 mit Bloom) leicht abweichen; neue Referenzen immer über den
Workflow „Screenshots aktualisieren“ erzeugen.

## 4. Empfehlungen

Die priorisierten nächsten Ausbaustufen stehen im Konzept (`docs/KONZEPT.md`, Abschnitte 12 und 13). Kurzfassung:

1. **Betrieb auf dem Gerät (Stufe 6):** Leistung messen, Watchdog, Fehler-Telemetrie, Service-Worker-Cache,
   Setup-Skript für den Pi. Das ist die größte Lücke: Auf echter Hardware wurde noch nichts gemessen.
2. **Kleine Verbesserungen ohne Gerät:** Lyrics-Cache-Schlüssel (#14), BPM-Startwert, Geocoding für Konzerte,
   Song liken per Touch.
3. **Production:** Upstash verbinden, `ALLOWED_SPOTIFY_USERS` setzen, Branch-Schutz für `main` in GitHub einschalten.

## 5. Show-Architektur (Konzert-Erlebnis, Stand 2026-11-16)

Für das Konzert-Erlebnis wurde die Bühne in vier Schichten gegliedert. Jede Schicht kennt nur die darüber.

```
1 FAKTEN        Song-Kontext: Titel, Künstler, Lyrics, Abschnitte, Tempo, Mikrofon-Analyse
                + Genres/Stimmung aus offenen Quellen (TheAudioDB, Last.fm)        lib/show/tags.ts
2 REGIE         Regeln (Genre → Bühne, Abschnitt → Energie …)                      lib/stage/themes.ts u. a.
                + Tagesform (anderer Zufall je Tag, nur live)                      song.variant
                + Gedächtnis des Abends (vorige Bühne, letzte Tänze; nur Speicher) lib/stage/setlist.ts
                + Regieanweisung der KI („Brief“, optional)                        lib/show/brief.ts, director.ts
3 PLÄNE         reine Funktionen von (Song, Regie, Songzeit) – deterministisch
                Choreografie: Tanz, Moment, Formation, Kamera, Drehbühne           lib/dance/plan.ts
                Höhepunkte: Countdown, Blackout, Zeitlupe, Kameraflug im Finale    lib/stage/climax.ts
                Band nach Genre: DJ, Gitarre + Schlagzeug, Keyboard                lib/stage/band.ts
                Effekt-Einsätze: Pyro, Flammen, CO₂, Konfetti, Schaum …            lib/stage/effects.ts
                Publikums-Regie: Hände, Springen, Handys, Armbänder                lib/stage/crowd.ts
                Licht: Moving Heads, Laser, Wand, Lampen-Signal                    lib/stage/lights.ts
                Lyrics: Darstellung und Schrift-Effekt je Abschnitt                lib/lyrics/director.ts
4 DARSTELLER    setzen nur um, ohne eigene Entscheidungen                          components/stage, components/lyrics
                Avatare, Kamera, Partikel (Vertex-Shader), Publikum (ein Draw-Call), Licht, DOM-Lyrics
```

**Regeln für neue Features**

- **Entscheidungen fallen in Schicht 2 und 3, nie im Darsteller.** Ein neuer Effekt ist: ein Eintrag in
  `effectKinds`, eine Regel in `planEffects`, ein Emitter in `effects/emitters.ts` (Partikel) oder `Effects3D.tsx` (3D-Körper). Gleiche Songzeit ergibt das gleiche
  Bild, deshalb bleiben Screenshots reproduzierbar und die Regeln per Unit-Test prüfbar.
- **Die KI gibt nur die Richtung vor, nie den Takt.** Der Brief wählt Bühne, Stimmung und je Abschnittsart
  Energie, Schrift-Effekt, Publikumsverhalten, Wunsch-Effekte und Choreografie-Moment. Wann genau etwas zündet, bestimmen die Pläne
  aus Abschnitten und Beat-Raster. Der Brief ist ein zod-Schema aus Aufzählungen: die KI kann nichts verlangen,
  was die Bühne nicht kann, und eine unbrauchbare Antwort wird verworfen.
- **Anbieter austauschbar.** Claude (`lib/show/director.ts`) und OpenAI (`director-openai.ts`) bekommen dieselbe
  Anweisung, dieselbe Songbeschreibung und dasselbe Schema; gewählt wird per Umgebung (`showAi()`), Claude zuerst.
  Ein weiterer Anbieter braucht nur eine Funktion `(SongFacts) → DirectorResult`.
- **Momente statt Nebeneinander.** Jede Phrase hat einen Moment: *synchron* (alle denselben Tanz; Refrain-Einsatz),
  *kanon* (derselbe Tanz als Welle von links nach rechts, je Platz ein Schlag), *solo* (Lead im Spot, Crew hält
  still, Kamera nah) oder *frei*. Die Regeln wählen nach Abschnitt (`momentFor`), die KI kann je Abschnitt einen
  Moment vorgeben; spätere Phrasen eines Abschnitts variieren, damit nichts erstarrt.
- **Höhepunkte werden inszeniert.** `planClimaxes` markiert Refrain-Einsätze; der erste und das Finale (letzter
  Refrain) bekommen einen Takt vorher Blackout mit Countdown 4-3-2-1 (DOM-Ebene über der Bühne, unabhängig von der
  Kamera), beim Einsatz zünden alle Effekte der Bühne, Blitz (nur mit Strobe-Erlaubnis) und ein Lauflicht über die
  Govee-Lampen (`signal.chase`, je Lampe nach Reihenfolge in `config.json`). Im Finale läuft der Tanz zwei Takte in
  Zeitlupe (`danceTime`: erst langsamer, dann aufholen – danach wieder im Takt), die Kamera fliegt von hinter dem
  Publikum auf die Bühne.
- **Band nach Genre.** `planBand` stellt hinter die Tänzer auf ein Podest: DJ am Pult (Techno/House/EDM), Gitarrist
  und Schlagzeuger (Rock/Metal/Punk) oder Keyboarder (Jazz/Soul/Klassik/Ballade). Musiker sind zusätzliche Avatare,
  die nicht tanzen (passende Typen bevorzugt, Look der Crew), und spielen ihre Animation im Songtakt; Instrumente
  sind einfache Formen mit Leuchtakzenten (`components/stage/Band.tsx`). Nicht auf Qualitätsstufe „niedrig“.
- **Auftritt und Abgang.** In den ersten drei Takten kommt die Crew nacheinander von der Seite (Gehen, Blick in
  Gehrichtung, am Platz zum Publikum drehen; Lead zuletzt), in den letzten zwei Takten winken alle und verbeugen
  sich (Vorbeugen des Oberkörpers im Avatar, Winkel aus `bowAngleAt`). Gehen und Winken sind Mixamo-Clips, die nicht
  getanzt, aber für die Bühne mitgeladen werden (`STAGE_CLIPS`).
- **Publikum nach Stil.** Rock → Moshpit vor der Bühnenmitte im Refrain (Rempeln und Springen im Shader), Ballade
  oder ruhiger Song → Feuerzeuge statt Handys (warm, flackernd). Die KI kann beides als Publikumsanweisung geben.
- **Kamera wie ein Konzertmitschnitt.** Bei hoher Energie harte Schnitte statt Fahrten und alle 4 Takte ein Wechsel
  zwischen zwei stehenden Einstellungen (`cut`, `shotAt`), dazu leichte Handkamera; neue Einstellung „ueberkopf“
  aus dem Publikum über die Köpfe. Kreisfahrt, Zoom und Drehbühne bleiben ungeschnitten.
- **Lippensynchron.** `lib/dance/lipsync.ts` teilt jedes Wort an den Vokalen in Silben (oder nimmt die Silben mit
  eigenem Timing, bei Umschrift deren Wörter) und gibt jeder Silbe eine Mundform (offen, rund). Jede Zeile gehört
  ihrem Sänger (Feature-Songs), im Refrain singt die Crew leiser mit. Comic-Gesichter bekommen einen Mund am Kopf
  (das gemalte Lächeln weicht), LED- und Visier-Gesichter bewegen ihre Balken. Mit Mikrofon moduliert die gemessene
  Gesangslautstärke die Öffnung; ohne Lyrics öffnet die Stimme allein.
- **Bühne wie bei einem echten Konzert.** Lichtkegel mit Dunst, der durch den Kegel zieht (3D-Rauschen im
  Shader), Staub im Licht, leuchtenden Linsen und Lichtflecken auf dem Boden; Blinder auf der Traverse
  (`LightFrame.blinders`) blitzen beim Einsatz eines Höhepunkts warm ins Publikum und in die Kamera (ohne
  Strobe-Erlaubnis nur einmal). Live-Bildschirme an der LED-Wand zeigen, was eine zweite Kamera filmt
  (`lib/stage/screens.ts`: Nahaufnahme des Sängers, Crew, Publikum von der Bühne, Totale; Schnitt alle zwei Takte;
  ab Qualität „mittel“, Render-Target). Das Publikum trägt unterschiedliche Kleidung, Haare und Kappen, die
  vorderen Reihen fängt das Bühnenlicht; es klatscht über dem Kopf im Takt (`clap`, auch als KI-Anweisung
  „klatschen“), auf dem Festival wehen Fahnen. Monitorboxen an der Bühnenkante, Schaumkanonen auf Stativen.
- **Viele Figuren aus wenigen Modellen.** `lookFor` (lib/avatars/looks.ts) gibt jedem Auftritt Zubehör und Statur:
  Basecap, Mütze, Cowboyhut, Zylinder, Fischerhut, Kopfhörer, Sonnenbrille (nur Comic-Gesichter), Größe 94–106 %.
  Künstler tragen immer denselben Look, die Crew wechselt je Song, die Band bleibt. `components/stage/Accessories.ts`
  misst die Kopfform in der Grundhaltung (Vertices über dem Hals) und hängt die Teile an Kopf- bzw. Handknochen;
  Sänger halten ein Handmikrofon in der rechten Hand.
- **Andere Figuren aus Formen.** `scripts/avatars/build-characters.mjs` baut neue Avatare mit eigener Silhouette:
  bisher 29 Figuren in Gruppen (`scripts/avatars/figuren/*.mjs`): Bühne (Bär, Retro-Bot, Astronautin, Alien, Punk,
  Diva), Genres (Cowboy, Skelett, Katze, Ritter, Pinguin, Rapperin), Stile (Dirndl, Lederhose, Rock'n'Roll, Disco-King,
  Mariachi), Saison (Weihnachtsmann, Rentier, Schneemann, Kürbiskopf, Vampir), Fantasie (Dino, Einhorn, Fuchs,
  Hai-Kostüm, Zauberer, Pirat, Ninja) und 10 Chibis (Mika, Fuchsi, Hana, Momo, Rin, Sora, Tora, Kai, Leo, Pixel). Chibis
  ändern die Proportionen am Skelett (`spec.proportions`: Beine, Arme, Rumpf kürzer, Hüfte sinkt mit – die Tänze
  bleiben stimmig, Bind-Matrizen werden neu berechnet) und bekommen große Anime-Augen mit Glanzlichtern,
  Wangenröte, Pony und Tierohren/Kapuzen (`scripts/avatars/chibi.mjs`). Die GLBs entstehen beim Build (`prebuild`) unter `avatars/generated/` (nicht im
  Repo, byte-gleich, Version aus den Quellen im Manifest). Skelett, Gesichtsknochen und alle 32 Tanz-Clips
  stammen von einem vorhandenen Modell; der Körper entsteht aus abgerundeten Formen (Superellipsoide, Röhren
  zwischen Gelenken), die weich an die Knochen gebunden sind (Ellbogen, Knie, Rumpf, Rock folgt den Beinen).
  Gesichtsknochen (Augen, Lächeln, LED-Balken) werden samt Animationsspuren auf die neue Kopfform verschoben, so
  singen und blinzeln die Figuren wie die anderen. Materialnamen mit „stage suit“, „armor“, „luminous trim“ nehmen
  Outfit- und Künstlerfarben an. Vorschaubilder: `scripts/avatars/render-previews.mjs`; Bühnenprobe mit
  `?avatare=disco-baer,retro-bot,glitzer-diva`. Die Besetzung bevorzugt sie nach Genre (Punk, Disco/Soul,
  Space/Ambient/Synth, Party/Kinder, Techno, Country, Metal/Goth, Epic/Mittelalter, K-Pop, Klassik, Hip-Hop).
  Figuren mit eigener Kopfbedeckung oder auffälligem Kopf (`OWN_HEADWEAR` in lib/avatars/looks.ts) bekommen keinen
  zusätzlichen Hut. Gesicht prüfen: `render-previews.mjs --kopf <id>`.
  Saison-Besetzung (`withSeasonalCrew`): Weihnachts- und Halloween-Songs tanzen das ganze Jahr mit ihrer Crew; im
  Advent und in den zwei Wochen vor Halloween kommt bei etwa zwei von drei Songs ein Crew-Mitglied als
  Background-Tänzer dazu (deterministisch aus Song und Tag, Künstler behalten ihren Avatar).
  Einstellungen (pro Konto): **Avatar-Stil** „gemischt“ oder „nur Chibis“ (`applyAvatarStyle`: jede Figur wird ein
  Chibi, passend zum Genre zuerst, Künstler stabil) und der **Avatar-Baukasten** je Künstler – Figur, Outfit,
  Kopfbedeckung (auch „ohne“), Sonnenbrille, Kopfhörer, Größe, Leuchtfarbe (`look`/`trim` am Platz des Künstlers,
  `applyLookOverride` legt den Wunsch über den gewürfelten Look). Demo: `?stil=chibi`.
- **Ein Abend mit Spannungsbogen.** `eveningPhase` (lib/show/evening.ts) gibt jedem Song eine Phase aus der Setlist:
  Auftakt, Steigerung, Höhepunkt (dritter energiegeladener Song in Folge: Feuerwerk und volles Konfetti schon beim
  ersten großen Einsatz), Durchatmen (ruhiger Song nach wilden: Feuerzeuge) und Zugabe (nach einem ausgespielten
  Höhepunkt oder Lieblingssong; nie zweimal hintereinander). Die Setlist merkt sich dazu Stimmung, Like, Phase und
  ob ein Song bis kurz vor Schluss lief – aufgezeichnet von `useEveningTracker` im Dashboard, unabhängig von der 3D-Bühne (die nur Thema und Tänze ergänzt). Beim Songwechsel startet derselbe Tracker den Übergang (`transitionStore`), `SongTransition` zeigt den Umbau (Licht aus, Nebel,
  suchende Lichtkegel, nächster Song mit Motto) bzw. Zugabe-Rufe mit Handylichtern und blendet aus, sobald die neue
  Bühne steht. Das Motto (`mottoFor`: KI-Regie, sonst aus Stimmung und Titel) läuft zum Songstart ein und steht im
  Schnappschuss für Alexa („Wie heißt das Motto?“). Erzwingbar für Demos: `?uebergang=umbau|zugabe`.
- **Wetter.** `weatherFor` (lib/stage/weather.ts): auf Freiluftbühnen Schnee bei Winter-/Weihnachtssongs und im
  Dezember/Januar ab und zu, Regen bei Songs über Regen/Sturm/Tränen und gelegentlich bei ruhigen Songs; nie unter
  Dach, am Strand kein Schnee. Deterministisch aus Song, Bühne und Datum (Demos: festes Datum), erzwingbar mit
  `?wetter=regen|schnee|aus`. Regen als Striche, Schnee als treibende Flocken, beides im Shader aus der Songzeit.
- **Ein Abend, nicht lauter Einzelsongs.** `setlistStore` merkt sich Bühne und Tänze der gespielten Songs. Der
  nächste Song meidet die Bühne des vorigen (verwandte statt gleiche: Club → Synthwave/Weltraum/Festival, Jazz
  bleibt Jazz) und wählt Tänze der letzten zwei Songs seltener. Nur im Speicher: Neuladen beginnt einen neuen
  Abend, Demos und Screenshots bleiben reproduzierbar.
- **Alles ist optional.** Ohne KI-Schlüssel läuft die Show mit Regeln und Tagesform; ohne Tags wechselt
  die Bühne je Song und Tag; ohne Lyrics werden Abschnitte aus der Dauer geschätzt.
- **Nichts stellt mitten im Song um.** Regie-Daten, die später als 25 s nach Songbeginn eintreffen, werden nicht
  mehr angewendet. Sie liegen dann im Cache für das nächste Abspielen.
- **Kosten sind gedeckelt.** Ein KI-Aufruf je Song und Modell, 30 Tage gecacht; Ablehnungen 3 Tage; Störungen
  gar nicht (nächster Song versucht es neu). Die Abwechslung von Tag zu Tag kommt aus der Tagesform, nicht aus
  neuen KI-Aufrufen.
- **Leistung skaliert über die Qualitätsstufe:** Partikelanteil, Publikumsgröße, Moving Heads, Bloom.

**Server**

```
/api/show   Session → Tags (TheAudioDB, Last.fm; Cache 30 d) → KI-Brief (Claude oder OpenAI, strukturierte Ausgabe;
            liest Aufbau und Textauszug aus dem Lyrics-Cache; Cache 30 d) → { genres, mood, brief, source }
            Mitschrift je Song und Modell (komplette Frage, rohe Antwort, Dauer, Token, Fehler) im selben Cache
/api/show/trace   Session → { ai, trace } für Debug-Panel und /debug
```

**Nächste Ausbaustufen** stehen im Konzept, Abschnitt 13 (Stufen 10–14).

