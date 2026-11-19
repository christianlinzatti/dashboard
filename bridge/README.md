# Pi-Bridge

Kleiner Dienst auf dem Raspberry Pi oder einem Windows-, Linux- oder Mac-Rechner. Er verbindet das Dashboard im Browser mit Geräten im Heimnetz.
Aktuell steuert er die **Govee-Lampen über die LAN-API**, im Takt des LightDirectors.

```
Dashboard (Chromium, Vercel-Seite) ──WebSocket ws://127.0.0.1:8787──► Pi-Bridge ──UDP 4003──► Govee-Lampen
                                                                       └─ UDP-Multicast-Suche (4001/4002)
```

## Einrichtung

1. In der **Govee-Home-App** bei jeder Lampe die Firmware aktualisieren und **„LAN-Steuerung“** einschalten.
2. Node ≥ 22.18 installieren (führt TypeScript direkt aus), dann im Projektordner:

   ```bash
   npm ci --omit=dev --ignore-scripts
   node bridge/setup.ts
   ```

   Das Setup **sucht alle Govee-Lampen im Netz**, lässt jede kurz pink/türkis **blinken** (danach ist sie wieder wie
   vorher) und fragt Name und Rolle ab. Den Namen aus der Govee-App (z. B. „hinten“, „wand“, „l1“) kennt die LAN-API
   nicht, darum das Blinken. Eine Rolle wird nach Modell vorgeschlagen, mit Enter übernimmt man sie. Mit `-` bleibt
   eine Lampe außen vor. Außerdem fragt es die Adresse des Dashboards ab, z. B. `https://dein-projekt.vercel.app`.
   Nur diese Seite darf die Lampen steuern.

   Das Ergebnis steht in `bridge/config.json`. Jede Lampe ist über ihre **Geräte-ID** zugeordnet. Das klappt auch,
   wenn zwei Lampen dasselbe Modell haben oder der Router neue IPs vergibt. Das Setup lässt sich jederzeit neu
   starten, z. B. für eine neue Lampe: Bekannte Lampen behalten Name und Rolle, und Watchdog und Port bleiben erhalten.
   Ohne Fragen geht es so: `node bridge/setup.ts --origin https://dein-projekt.vercel.app --yes`.

3. Starten: `node bridge/main.ts` (oder `npm run bridge`).
4. Status prüfen: `http://127.0.0.1:8787/status` im Browser.

Findet die Suche eine Lampe nicht, kann sie in `config.json` statt `id` eine feste `ip` bekommen. Die IP steht in der
Router-Oberfläche und wird dort am besten fest vergeben.

### Raspberry Pi / Linux als Dienst

```bash
sudo cp bridge/sonic-bridge.service /etc/systemd/system/
sudo systemctl enable --now sonic-bridge
```

### Windows

1. **Node.js LTS** installieren: [nodejs.org](https://nodejs.org) oder `winget install OpenJS.NodeJS.LTS`.
2. Projekt herunterladen (`git clone …` oder ZIP von GitHub) und **`bridge\start-windows.cmd` doppelklicken**.
   Das Skript prüft die Node-Version, installiert beim ersten Mal die Abhängigkeiten, startet ohne
   `config.json` das Setup und dann die Bridge. Das Fenster offen lassen, Strg+C beendet die Bridge.
3. **Firewall:** Beim ersten Start fragt Windows nach Netzwerkzugriff für „Node.js“. Dort **„Private Netzwerke“**
   erlauben. Die Antworten der Lampen kommen per UDP an Port 4002 und werden sonst blockiert.
   - Das WLAN muss in Windows als **„Privates Netzwerk“** eingestuft sein (Einstellungen → Netzwerk → WLAN →
     Netzwerkprofiltyp).
   - Wurde die Frage weggeklickt, einmal in einer Admin-PowerShell freigeben:

     ```powershell
     New-NetFirewallRule -DisplayName "Sonic Bridge (Govee)" -Direction Inbound -Protocol UDP -LocalPort 4002 -Action Allow -Profile Private
     ```

4. Mehrere Netzwerkadapter (WSL, Hyper-V, VirtualBox, VPN) stören nicht: Die Suche geht über jeden Adapter einzeln.
   Ein aktives VPN kann aber das Heimnetz abschneiden, dann das VPN zum Testen trennen.
5. Das Dashboard läuft in **Chrome oder Edge** auf demselben Rechner. Die Bridge hört nur auf `127.0.0.1`.
   Fragt der Browser nach „Zugriff auf lokales Netzwerk“, einmal erlauben.
6. Autostart (optional): Mit Win+R `shell:startup` öffnen und dort eine Verknüpfung auf `start-windows.cmd` ablegen.

Der Watchdog funktioniert auch unter Windows. `command` läuft dort in `cmd.exe`, z. B. so:
`"command": "taskkill /IM msedge.exe /F & start \"\" msedge --kiosk https://dein-projekt.vercel.app --edge-kiosk-type=fullscreen"`.

## Rollen

| Rolle | Verhalten | gedacht für |
|---|---|---|
| `puls` | Akzentfarbe, Helligkeit springt mit dem Beat | LED-Strips hinter dem Display |
| `akzent` | Akzentfarbe, folgt der Gesamthelligkeit, leichter Puls | Wand-/Panel-Leuchten |
| `grund` | ruhige Grundfarbe des Covers, gedimmt | Tisch-/Stehlampen |

Das Setup schlägt die Rolle nach Modell vor: Strips (H61…) → `puls`, Light Bars und Wandleuchten
(H604…, H6056/57, H606…) → `akzent`, alles andere → `grund`. Das ist nur ein **Vorschlag**, bitte nach
Aufstellung im Raum anpassen.

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

## Bildschirm nachts ausschalten (HDMI)

In den Einstellungen des Dashboards (`/einstellungen` → „Bildschirm nachts aus“) legst du eine Ruhezeit fest. Ohne Bridge
wird der Bildschirm dann nur schwarz. Mit diesem Eintrag in `config.json` schaltet die Bridge ihn wirklich ab und wieder
an, sobald Musik läuft oder jemand auf den Bildschirm tippt:

```json
"display": { "off": "wlopm --off '*'", "on": "wlopm --on '*'" }
```

Welcher Befehl passt, hängt vom System ab:

| System | aus | an |
|---|---|---|
| Raspberry Pi OS (Wayland, labwc/wayfire) | `wlopm --off '*'` | `wlopm --on '*'` |
| Wayland ohne `wlopm` | `wlr-randr --output HDMI-A-1 --off` | `wlr-randr --output HDMI-A-1 --on` |
| X11 | `xset dpms force off` | `xset dpms force on` |
| Fernseher per HDMI-CEC | `echo 'standby 0' \| cec-client -s -d 1` | `echo 'on 0' \| cec-client -s -d 1` |

Den Namen des Ausgangs zeigt `wlr-randr`. `wlopm` versetzt den Monitor nur in den Ruhemodus (wie DPMS). Das
Antippen eines Touchscreens weckt ihn dann in der Regel wieder. Schaltet `wlr-randr` den Ausgang ganz ab, kann es sein,
dass Berührungen nicht mehr ankommen. Dann weckt erst die Musik den Bildschirm.

Sicherheitsnetz: Geschaltet wird höchstens alle 10 s. Beim Start der Bridge und wenn der Watchdog eingreift, geht der
Bildschirm an. Meldet sich das Dashboard bei dunklem Bildschirm zwei Minuten lang nicht, geht er ebenfalls wieder an.
`http://127.0.0.1:8787/status` zeigt den Zustand (`display.on`, letzter Grund). Mit einem echten Monitor ist das
noch nicht getestet. Bitte einmal von Hand prüfen, ob die Befehle auf deinem Gerät wirken.

## Hinweise

- **Chromium und lokale Adressen:** Neuere Chromium-Versionen fragen nach, bevor eine öffentliche Seite
  (Vercel) auf `127.0.0.1` zugreift („Zugriff auf lokales Netzwerk“). Im Kiosk die Frage einmal erlauben
  oder per Richtlinie `LocalNetworkAccessAllowedForUrls` für die Dashboard-Adresse freigeben.
- Die Bridge sendet je Lampe höchstens 10 Befehle pro Sekunde und nur bei Änderungen, sonst verschlucken
  Govee-Geräte Befehle.
- Der Schalter **„Lampen an/aus“** in der Steuerleiste (und später Alexa) schaltet alle Lampen aus.
- Getestet ist das gegen ein **nachgebildetes** Govee-Gerät (`tests/unit/bridge.test.ts`). Wie die echten
  Modelle auf Befehlsrate und Farben reagieren, zeigt erst der Test zu Hause.
