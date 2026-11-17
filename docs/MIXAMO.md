# Mixamo-Tänze einbinden

Die Avatare haben ein Skelett mit Mixamo-Knochennamen. Tänze von [mixamo.com](https://www.mixamo.com)
lassen sich deshalb umwandeln und auf **alle** Avatare übertragen. Ein Retargeting über Knochenrichtungen
gleicht die unterschiedliche Grundpose (Mixamo T-Pose ↔ Avatar) aus.

**Lizenz:** Mixamo-Animationen dürfen in eigenen Projekten verwendet werden. Die heruntergeladenen
FBX-Dateien dürfen aber nicht als Rohdateien weitergegeben werden. Deshalb gilt:

- Der Ordner `mixamo/` ist in `.gitignore` und bleibt lokal.
- Ins Repo kommen nur die umgewandelten Clips (`public/animations/*.json`).

## 1. Herunterladen

1. Bei mixamo.com mit einem (kostenlosen) Adobe-Konto anmelden.
2. Einen Tanz aus `lib/dance/mixamo-clips.json` suchen (Feld `search`, z. B. „Samba Dancing“).
   Die Figur ist egal; es wird nur die Bewegung übernommen.
3. Wenn angeboten, **In Place** aktivieren. Die übrigen Regler bleiben auf Standard.
4. **Download** mit diesen Einstellungen:

   | Einstellung | Wert |
   |---|---|
   | Format | FBX Binary (.fbx) |
   | Skin | **Without Skin** (kleinere Datei; „With Skin“ geht auch, z. B. bei Paketen) |
   | Frames per Second | 30 |
   | Keyframe Reduction | none |

5. Die Datei nach `mixamo/` im Projektordner legen. Der Dateiname sollte zu `source` oder `search`
   im Katalog passen; Groß-/Kleinschreibung, Leer- und Sonderzeichen sind egal.

### Mehrere Varianten mit gleichem Namen

Viele Tänze gibt es bei Mixamo mehrfach, z. B. ein gutes Dutzend „Hip Hop Dancing“. Lade einfach alle
herunter. Der Browser nummeriert sie durch: „Hip Hop Dancing (1).fbx“, „(2)“ … Du kannst sie auch frei
umbenennen.

Jede FBX in `mixamo/`, die nicht im Katalog steht, wird automatisch aufgenommen:

| Was | Woher |
|---|---|
| ID | aus dem Dateinamen, z. B. `Mixamo_HipHopDancing_2` |
| Genres und Ersatz-Clip | aus Stichwörtern im Namen (Hip Hop, Samba, Swing, Breakdance, Robot, Shuffle …) |
| Energie | aus der Bewegung gemessen (Drehgeschwindigkeit der Gelenke und Hüftwippen) |

**Doppelte Downloads** erkennt das Skript an der Bewegung, nicht am Namen. Es vergleicht einen
Fingerabdruck aus jedem umgewandelten Tanz. Derselbe Tanz zweimal heruntergeladen hat praktisch denselben
Fingerabdruck, verschiedene Varianten unterscheiden sich deutlich. Der zuerst eingetragene Tanz bleibt,
der doppelte wird übersprungen:

```
= Mixamo_JazzDancing_5: Jazz Dancing (5).fbx ist derselbe Tanz wie Mixamo_JazzDancing_3 (Jazz Dancing (3).fbx) – übersprungen
```

Im Katalog steht er dann mit `"duplicateOf"` und `"skip": true`.

**Was kein Tanz ist**, wird automatisch übersprungen und bekommt `"skipReason": "kein Tanz"`: Kampf, Waffen,
Gehen und Laufen, Zombies, Telefonieren, Umschauen und Ähnliches. Übergänge, also Idle, Start, Ende oder
„To Idle“, bekommen `"skipReason": "Übergang"`. **Bühnengesten** werden dagegen genutzt: Guitar Playing und
Playing Drums bei Rock, Cheering, Clap, Victory und Waving bei Party und Pop.

**Neu nummerierte Downloads:** Lädst du Varianten erneut herunter, vergibt der Browser die Nummern womöglich
anders, und unter „Hip Hop Dancing (4).fbx“ liegt dann ein anderer Tanz als vorher. Das Skript erkennt das an
der Bewegung und überschreibt den bisherigen Tanz nicht. Es sichert ihn als eigenen Eintrag
(`…_alt`, `"preserved": true`):

```
↺ Mixamo_HipHopDancing_4: Hip Hop Dancing (4).fbx enthält jetzt einen anderen Tanz – der bisherige bleibt als Mixamo_HipHopDancing_4_alt
```

Solche Einträge tragen `"auto": true`, und ihre Energie wird bei jeder Umwandlung neu gemessen. Willst du
Energie oder Genres selbst festlegen, ändere den Eintrag und entferne `auto`.

## 2. Umwandeln

```bash
npm run mixamo
```

Für einen einzelnen Tanz:

```bash
npm run mixamo -- --only Mixamo_Samba
```

Das Skript arbeitet in diesen Schritten:

1. Es überträgt die Bewegung Frame für Frame auf das Avatar-Skelett. Finger bleiben in Grundpose.
   Die Hüfte wippt weiter, wandert aber nicht von ihrem Platz.
2. Es schätzt das Tempo aus dem Wippen der Hüfte. Ein Wert `bpm` im Katalog hat Vorrang.
3. Es schneidet ganze Takte als nahtlose Schleife heraus und normiert auf 120 BPM. Wie bei den
   eingebauten Clips ist dann ein Schlag eine halbe Sekunde, und die Bühne passt das Tempo an den Song an.
4. Es schreibt `public/animations/<id>.json` (etwa 100 KB) und trägt Datei, Tempo und Länge in den
   Katalog ein.

Danach die Clips und den Katalog committen:

```bash
git add public/animations lib/dance/mixamo-clips.json
```

## 3. Feinschliff im Katalog (`lib/dance/mixamo-clips.json`)

| Feld | Bedeutung |
|---|---|
| `energy` | 0 ruhig · 1 mittel · 2 hoch · 3 Höhepunkt: in welchen Songteilen der Tanz vorkommt |
| `genres` | Stichwörter. Passt ein Song-Genre dazu, wird der Tanz doppelt so oft gewählt. |
| `fallback` | eingebauter Clip, solange der Mixamo-Clip lädt oder fehlt |
| `bpm` | Tempo der Aufnahme, falls die Schätzung danebenliegt (Ausgabe des Skripts prüfen) |
| `start`, `end` | Ausschnitt in Sekunden, z. B. um einen Anlauf am Anfang wegzulassen |

Für einen **neuen Tanz** einen Eintrag mit `id` (`Mixamo_…`), `source`, `search`, `energy`, `genres`
und `fallback` ergänzen. Danach das Skript erneut ausführen.

## Mesh2Motion-Tänze (GLB)

[Mesh2Motion](https://github.com/Mesh2Motion/mesh2motion-app) ist eine Open-Source-Alternative zu Mixamo.
Seine Animationen stehen unter **CC0**. Sie sind also frei nutzbar, ohne Konto und ohne Einschränkung bei der
Weitergabe.

```bash
npm run mesh2motion        # lädt die 5 Tänze nach mesh2motion/
npm run mixamo             # wandelt Mixamo-FBX und Mesh2Motion-GLB gemeinsam um
```

- Weitere Animationen aus `static/assets/human/animations` im Mesh2Motion-Repo lädt man über ihren Namen:
  `npm run mesh2motion -- clapping greeting`. Eigene GLB-Exporte aus der Mesh2Motion-App (menschliches Skelett) kann
  man auch direkt nach `mesh2motion/` legen.
- Das Skelett benennt die Knochen im Unreal-Stil (`pelvis`, `spine_01–03`, `upperarm_l`, `calf_r` …). Die Umwandlung
  übersetzt diese Namen in die Mixamo-Namen (`sourceBoneName` in `lib/dance/retarget.ts`). Die Dateien sind
  meshopt-komprimiert, der Decoder gehört zu three.js.
- Die Mesh2Motion-Tänze sind kurze, nahtlose Schleifen von 1–3 s, oft kürzer als ein Takt. Die Umwandlung wiederholt
  sie deshalb. Das Tempo wird so gewählt, dass ein Durchlauf ganze Schläge dauert und die Schleife ganze Takte lang ist.
- IDs beginnen mit `M2M_` (z. B. `M2M_DanceCharleston`). Ansonsten verhalten sich die Einträge im Katalog wie
  automatisch aufgenommene Mixamo-Tänze: Stil aus dem Namen, Energie aus der Bewegung.

## CMU-Motion-Capture (BVH)

Die [CMU Graphics Lab Motion Capture Database](http://mocap.cs.cmu.edu) enthält echte Tanzaufnahmen: Salsa,
Lambada, Charleston, Twist, Macarena, Breakdance, russischer und indischer Tanz. Die Daten sind frei verwendbar,
auch kommerziell. Geladen wird die BVH-Umwandlung von Bruce Hahne (cgspeed) über einen GitHub-Spiegel.

```bash
npm run cmu                  # lädt die Auswahl nach cmu/ (z. B. salsa_60_01.bvh)
npm run cmu -- 60_02 61_05   # weitere Aufnahmen nach Nummer aus dem CMU-Index (60/61 = Salsa)
npm run mixamo               # wandelt alles gemeinsam um
```

- Der Dateiname beschreibt den Tanz, daraus entstehen ID (`CMU_Salsa_60_01`), Stil und Ersatz-Clip. Aufnahmen, die
  über die Nummer geladen werden, heißen nach dem Probanden (60/61 → `salsa_60_02.bvh`, 93/103 → Charleston),
  sonst `cmu_….bvh`. Wer sie umbenennt, bekommt den passenden Stil.
- Salsa ist ein Paartanz: Aufnahmen mit Dips oder fast nur Drehungen wirken allein seltsam. Sie stehen im Katalog
  mit `skip` und `skipReason: "Paartanz-Figur: …"` (ohne `auto`, damit die Umwandlung das nicht überschreibt).
- Der CMU-Rücken heißt `LowerBack › Spine › Spine1`. Beim Laden wird er auf `Spine › Spine1 › Spine2` umbenannt,
  alle anderen Knochen tragen schon Mixamo-Namen.
- **Blickrichtung:** Im Aufnahmeraum stehen die Tänzer oft seitlich oder mit dem Rücken zur Kamera. Die
  Umwandlung dreht die ganze Bewegung so, dass sie im Mittel nach vorn schauen. Drehungen im Tanz bleiben erhalten.
- Das erste Bild ist eine Kalibrierpose, und die Aufnahmen dauern bis zu 60 s. Automatische Einträge nehmen deshalb
  den Ausschnitt 0,1–16,1 s (`start`/`end` im Katalog, anpassbar).

Quelle: *The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding
from NSF EIA-0196217.*

## Bandai Namco Research Motiondataset (BVH)

Das [Bandai Namco Research Motiondataset](https://github.com/BandaiNamcoResearchInc/Bandai-Namco-Research-Motiondataset)
enthält zwei längere Tanzaufnahmen in Motion-Capture-Qualität (158 s und 63 s). Dazu kommen viele Alltagsbewegungen
in verschiedenen Stimmungen, die hier nicht gebraucht werden.

```bash
npm run bandai               # lädt beide Tänze nach bandai/ und zerlegt sie in 16,5-s-Ausschnitte
npm run mixamo               # wandelt alles gemeinsam um (IDs BN_DanceLong_01 …)
```

- Das Skelett heißt `joint_Root › Hips › Spine › Chest …` mit Seiten als `_L`/`_R`. Beim Laden wird es auf
  Mixamo-Namen umbenannt (`BANDAI_BONES` in `scripts/mixamo/convert.ts`).
- Die Knochen zeigen entlang ihrer lokalen X-Achse, mit Nullwinkeln ist das Skelett kein stehender Mensch. Als
  Ruhepose dient deshalb das erste Bild der Aufnahme (stehende Ausgangshaltung). Das Lade-Skript stellt es jedem
  Ausschnitt voran.

**Lizenz: CC BY-NC 4.0.** Die Clips dürfen nur **nicht-kommerziell** verwendet werden. Für ein privates Dashboard
ist das in Ordnung. Wird das Projekt kommerziell genutzt, müssen die `BN_*`-Clips raus (Katalog-Einträge und
`public/animations/BN_*.json`).

Quelle: *Bandai Namco Research Motiondataset © Bandai Namco Research Inc., lizenziert unter
[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). Änderungen: in Ausschnitte zerlegt, auf die
Avatar-Skelette übertragen, zur Kamera gedreht, auf 120 BPM normiert.*

## Wie es zur Laufzeit funktioniert

- Die Choreografie plant Mixamo-Tänze wie eingebaute Clips: nach Energie des Songteils,
  Wiederholungssperre und Genre-Bonus. Die Planung bleibt pro Song deterministisch.
- Pro Song werden nur die Clips geladen, die der Plan verwendet. Bis ein Clip da ist, oder wenn er
  fehlt, tanzt der Avatar den `fallback`. Fehler landen im Protokoll (`/api/log`).

## Probleme

| Meldung | Lösung |
|---|---|
| `document is not defined` (FBXLoader/TextureLoader) | behoben: Texturen werden in Node übersprungen. Repo aktualisieren und erneut umwandeln. |
| `✗ Mixamo_…: <Datei> – <Fehler>` | Diese Datei ließ sich nicht umwandeln; die übrigen laufen weiter. Mit `npm run mixamo debug=1` zeigt das Skript den ganzen Fehlerverlauf. Oft hilft ein erneuter Download mit FBX Binary. |
| `„…“ nicht gefunden` | Dateiname passt nicht zu `source`/`search` im Katalog: Datei umbenennen oder Eintrag anpassen. |
| Tanz wirkt zu schnell oder zu langsam | Das geschätzte Tempo liegt daneben, oft um den Faktor 2 oder 1,5. `bpm` im Katalog setzen und neu umwandeln. |
| `package-lock.json` verliert `esbuild` | Passiert mit npm 11 (Node 24) und `npm install`. Mit Node 22 (`.nvmrc`) und `npm ci` arbeiten, oder die Datei vor dem Commit zurücksetzen: `git checkout package-lock.json`. |

