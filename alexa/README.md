# Alexa-Skill „Sonic Stage“

Eigener (privater) Alexa-Skill. Er beantwortet Fragen zum laufenden Song und schaltet Lampen, Stroboskop
und Bühnenqualität des Dashboards.

| Beispiel | Wirkung |
|---|---|
| „Alexa, frag Sonic Stage, welcher Song läuft“ | Titel und Artists aus dem Dashboard |
| „Alexa, frag Sonic Stage, wer singt gerade“ | aktiver Sänger (bei Feature-Songs) |
| „Alexa, sag Sonic Stage Lampen aus“ | Govee-Lampen aus (über das Dashboard und die Pi-Bridge) |
| „Alexa, sag Sonic Stage Stroboskop aus“ | Strobe bei Drops aus |
| „Alexa, sag Sonic Stage Qualität niedrig“ | Bühnenqualität umstellen |

Befehle erreichen das Dashboard mit seiner nächsten Meldung an den Server, spätestens nach etwa 5 Sekunden.

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
