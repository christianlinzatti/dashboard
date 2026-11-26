# Pi-Bridge

Kleiner Dienst auf dem Raspberry Pi oder einem Windows-, Linux- oder Mac-Rechner. Er verbindet das Dashboard im Browser mit Geräten im Heimnetz.
Er steuert die **Govee-Lampen über die LAN-API** im Takt des LightDirectors und fragt die **Konzerttermine von
oeticket und eventim.de** über den Heimanschluss ab (den Server sperrt Eventim).

```
Dashboard (Chromium, Vercel-Seite) ──WebSocket ws://127.0.0.1:8787──► Pi-Bridge ──UDP 4003──► Govee-Lampen
                                                                       ├─ UDP-Multicast-Suche (4001/4002)
                                                                       └─ HTTPS ──► public-api.eventim.com
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

## Konzerttermine (oeticket, eventim.de)

Eventim sperrt Rechenzentrums-Adressen wie die von Vercel (403, Bot-Schutz). Die Bridge fragt deshalb vom
Heimanschluss aus. Der Kiosk zeigt zuerst die übrigen Quellen (Ticketmaster usw.), holt dann über die Bridge die Termine
von oeticket und eventim.de und lässt sie vom Server zusammenführen (`POST /api/concerts`). Ohne Bridge, zum Beispiel am
Laptop, fragt der Server wie bisher selbst.

Das ist ohne Eintrag eingeschaltet. Anpassen oder abschalten in `config.json`:

```json
"concerts": { "enabled": true, "shops": ["oeticket", "eventim"], "gapMs": 1000, "jitterMs": 1500, "maxPages": 8 }
```

- **Rücksichtsvoll:** Alle Anfragen an Eventim laufen nacheinander durch eine Warteschlange. Zwischen zwei Anfragen
  liegen `gapMs` plus zufällig bis zu `jitterMs` Millisekunden, standardmäßig 1 bis 2,5 s. Seiten, Shops und Künstler gehen so
  nicht gebündelt hinaus. Beim ersten Mal dauert es deshalb: ein Künstler mit 8 Ergebnisseiten in beiden Shops braucht
  gut 20 s. Die Konzertkarte kommt erst am Songende, das reicht meist.
- **Ehrlich:** Die Bridge meldet sich als `SonicStage-PiBridge/1.0`, sie gibt sich nicht als Browser aus. Sperrt
  Eventim auch den Heimanschluss, steht das als Fehler in `/debug` („eventim 403 – Zugriff gesperrt“). Umgehen lässt
  sich das nicht.
- **Cache:** Ergebnisse merkt sich die Bridge 12 h, Fehler 30 min, gleichzeitige Anfragen für denselben Künstler laufen
  nur einmal. Höchstens 3 Abfragen gleichzeitig. `/status` zeigt `concerts.cached` und `concerts.running`.
- **Prüfen:** In `/debug` unter „Konzerttermine“ steht hinter Quellen von der Bridge „(Pi)“.
- Der Server nimmt von der Bridge nur geprüfte Daten an: oeticket und eventim, höchstens 300 Termine je Liste. Ticket-Links
  müssen per https auf oeticket.com oder eventim.de zeigen.

## Hinweise

- **Chromium und lokale Adressen:** Neuere Chromium-Versionen fragen nach, bevor eine öffentliche Seite
  (Vercel) auf `127.0.0.1` zugreift („Zugriff auf lokales Netzwerk“). Im Kiosk die Frage einmal erlauben
  oder per Richtlinie `LocalNetworkAccessAllowedForUrls` für die Dashboard-Adresse freigeben.
- Die Bridge sendet je Lampe höchstens 10 Befehle pro Sekunde und nur bei Änderungen, sonst verschlucken
  Govee-Geräte Befehle.
- Der Schalter **„Lampen an/aus“** in der Steuerleiste (und später Alexa) schaltet alle Lampen aus.
- Getestet ist das gegen ein **nachgebildetes** Govee-Gerät (`tests/unit/bridge.test.ts`). Wie die echten
  Modelle auf Befehlsrate und Farben reagieren, zeigt erst der Test zu Hause.
