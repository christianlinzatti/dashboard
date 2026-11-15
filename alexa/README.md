# Alexa-Skill „Sonic Stage“

Eigener (privater) Alexa-Skill. Er beantwortet Fragen zum laufenden Song und schaltet Lampen, Stroboskop
und Bühnenqualität des Dashboards.

| Beispiel | Wirkung |
|---|---|
| „Alexa, frag Sonic Stage, welcher Song läuft“ | Titel und Artists aus dem Dashboard |
| „Alexa, frag Sonic Stage, wer singt gerade“ | aktiver Sänger (bei Feature-Songs) |
| „Alexa, frag Sonic Stage, wann ist der Song erschienen“ | Erscheinungsjahr und Album (laut Spotify) |
| „Alexa, frag Sonic Stage, erzähl mir was über den Song“ | Produzenten, Songwriter, Samples (Genius, braucht `GENIUS_ACCESS_TOKEN`) |
| „Alexa, frag Sonic Stage, was ist das für ein Sample“ | nur Samples, Zitate und Coverversionen |
| „Alexa, frag Sonic Stage, wann spielen die in der Nähe“ | nächstes Konzert im Umkreis (sonst der nächste Termin überhaupt), mit Countdown |
| „Alexa, frag Sonic Stage, wann spielt Kai Vento live“ | dasselbe für einen bestimmten Artist des Songs |
| „Alexa, frag Sonic Stage, wie oft habe ich das gehört“ | Hörzahl (Last.fm), Lieblingssong (Spotify), Herz auf Last.fm |
| „Alexa, frag Sonic Stage, mag ich den Künstler“ | ob du dem Artist auf Spotify folgst und wie oft du ihn gehört hast |
| „Alexa, frag Sonic Stage, erzähl mir was über die Band“ | erster Satz aus Wikipedia und Kurzfakten |
| „Alexa, sag Sonic Stage, merk dir den Song“ | speichert den laufenden Song in den Spotify-Lieblingssongs (über das Dashboard); „entferne den Song“ nimmt ihn heraus |
| „Alexa, sag Sonic Stage Lampen aus“ | Govee-Lampen aus (über das Dashboard und die Pi-Bridge) |
| „Alexa, sag Sonic Stage Stroboskop aus“ | Strobe bei Drops aus |
| „Alexa, sag Sonic Stage Qualität niedrig“ | Bühnenqualität umstellen |

Nach dem Ändern von `de-DE.json` das Interaktionsmodell in der Alexa-Developer-Console neu einfügen und
„Build Model“ ausführen.

Befehle erreichen das Dashboard mit seiner nächsten Meldung an den Server: beim Abspielen nach höchstens 15 Sekunden,
sonst nach höchstens einer Minute. „Merk dir den Song“ gilt dem Song, der beim Sprechen lief – auch wenn er inzwischen
gewechselt hat. Wiedergabe-Befehle (nächster Song, Pause) sind deshalb bewusst nicht eingebaut: dafür ist die
Verzögerung zu groß; Alexa steuert Spotify direkt.

## Einrichtung

1. [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask) → **Skill erstellen**:
   Sprache Deutsch, Modell **Custom**, Hosting **Provision your own**.
2. **Interaction Model → JSON Editor:** Inhalt von `alexa/de-DE.json` einfügen, speichern, **Build Model**.
3. **Endpoint:** HTTPS, Standard-Region: `https://<dein-projekt>.vercel.app/api/alexa`,
   Zertifikatstyp „My development endpoint is a sub-domain of a domain that has a wildcard certificate…“.
4. **Skill-ID** (beginnt mit `amzn1.ask.skill.`) kopieren und in Vercel setzen:
   - `ALEXA_SKILL_ID` = die Skill-ID
   - optional `ALEXA_SPOTIFY_USER` = deine Spotify-User-ID (Standard: erster Eintrag in `ALLOWED_SPOTIFY_USERS`)
5. **Upstash Redis** muss in Vercel verbunden sein. Sonst sieht die Alexa-Anfrage den Stand des Dashboards
   nicht, weil sie auf einer anderen Serverless-Instanz landen kann.
6. Im Reiter **Test** auf „Development“ stellen. Der Skill ist dann auf deinen Echo-Geräten nutzbar,
   ohne Veröffentlichung.

## Sicherheit

Jede Anfrage wird nach Amazons Vorgaben geprüft (`lib/alexa/verify.ts`):
- Herkunft der Zertifikatskette
- Gültigkeit und Name `echo-api.amazon.com`
- Kette bis zu einer vertrauenswürdigen Wurzel
- SHA-256-Signatur über den Inhalt
- Zeitstempel höchstens 150 Sekunden alt
- Skill-ID

Anfragen anderer Absender werden mit 400 abgewiesen.

## Grenzen

- Ein Dashboard gehört genau einem Spotify-Nutzer. Account-Linking für mehrere Nutzer ist nicht eingebaut.
- Ein virtuelles Smart-Home-Gerät („Party-Modus“ für Alexa-Routinen) braucht einen eigenen Smart-Home-Skill
  mit OAuth und ist noch nicht umgesetzt.
