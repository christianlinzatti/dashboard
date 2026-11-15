# Pi-Bridge

Kleiner Dienst auf dem Raspberry Pi. Er verbindet das Dashboard im Browser mit Geräten im Heimnetz.
Aktuell steuert er die **Govee-Lampen über die LAN-API**, im Takt des LightDirectors.

```
Dashboard (Chromium, Vercel-Seite) ──WebSocket ws://127.0.0.1:8787──► Pi-Bridge ──UDP 4003──► Govee-Lampen
                                                                       └─ UDP-Multicast-Suche (4001/4002)
```

## Einrichtung

1. In der **Govee-Home-App** bei jeder Lampe die Firmware aktualisieren und **„LAN-Steuerung“** einschalten.
2. Auf dem Pi (Node ≥ 22.18, führt TypeScript direkt aus):

   ```bash
   cd ~/dashboard && npm ci --omit=dev
   cp bridge/config.example.json bridge/config.json
   ```

3. In `bridge/config.json` eintragen:
   - `allowedOrigins`: die Adresse des Dashboards, z. B. `https://dein-projekt.vercel.app`. Nur diese
     Seite darf die Lampen steuern, fremde Webseiten werden abgewiesen.
   - `lamps`: Name, Modell (`sku`) und Rolle je Lampe. Findet die Suche ein Gerät nicht, statt `sku`
     eine feste `ip` eintragen (IP in der Router-Oberfläche nachsehen und dort fest vergeben).

4. Testen und als Dienst einrichten:

   ```bash
   node bridge/main.ts bridge/config.json
   sudo cp bridge/sonic-bridge.service /etc/systemd/system/
   sudo systemctl enable --now sonic-bridge
   ```

5. Status prüfen: `http://127.0.0.1:8787/status` im Browser auf dem Pi.

## Rollen

| Rolle | Verhalten | gedacht für |
|---|---|---|
| `puls` | Akzentfarbe, Helligkeit springt mit dem Beat | LED-Strips hinter dem Display |
| `akzent` | Akzentfarbe, folgt der Gesamthelligkeit, leichter Puls | Wand-/Panel-Leuchten |
| `grund` | ruhige Grundfarbe des Covers, gedimmt | Tisch-/Stehlampen |

Die Zuordnung in `config.example.json` für H61A2, H610B, H6063 und H6051 ist ein **Vorschlag**.
Bitte nach Aufstellung im Raum anpassen.

## Watchdog (Kiosk neu starten, wenn das Dashboard hängt)

Das Dashboard schickt alle 10 s ein Lebenszeichen mit, wann zuletzt ein Bild gezeichnet wurde. Bleibt es länger als
`timeoutS` aus oder hängt die Grafik länger als `frameStallS` (nur bei sichtbarer Seite), führt die Bridge `command` aus –
höchstens alle `cooldownS` Sekunden. Scharf wird der Watchdog erst nach dem ersten Lebenszeichen.

1. Kiosk als Dienst einrichten: `bridge/sonic-kiosk.service` nach `~/.config/systemd/user/` kopieren, Adresse anpassen,
   `systemctl --user enable --now sonic-kiosk`.
2. In `config.json`:

   ```json
   "watchdog": { "command": "systemctl --user restart sonic-kiosk.service", "timeoutS": 60, "frameStallS": 30, "cooldownS": 300 }
   ```

`http://127.0.0.1:8787/status` zeigt den Zustand (`watchdog.armed`, letztes Lebenszeichen, letzter Eingriff).

## Hinweise

- **Chromium und lokale Adressen:** Neuere Chromium-Versionen fragen nach, bevor eine öffentliche Seite
  (Vercel) auf `127.0.0.1` zugreift („Zugriff auf lokales Netzwerk“). Im Kiosk die Frage einmal erlauben
  oder per Richtlinie `LocalNetworkAccessAllowedForUrls` für die Dashboard-Adresse freigeben.
- Die Bridge sendet je Lampe höchstens 10 Befehle pro Sekunde und nur bei Änderungen, sonst verschlucken
  Govee-Geräte Befehle.
- Der Schalter **„Lampen an/aus“** in der Steuerleiste (und später Alexa) schaltet alle Lampen aus.
- Getestet ist das gegen ein **nachgebildetes** Govee-Gerät (`tests/unit/bridge.test.ts`). Wie die echten
  Modelle auf Befehlsrate und Farben reagieren, zeigt erst der Test zu Hause.
