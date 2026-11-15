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

