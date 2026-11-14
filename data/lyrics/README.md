# Eigene Lyrics-Korrekturen

Dateien hier haben Vorrang vor allen Lyrics-Providern.

- Dateiname = Spotify-Track-ID (aus dem Teilen-Link `open.spotify.com/track/<ID>`)
- `<ID>.lrc` – LRC oder Enhanced-LRC (Wort-Tags `<mm:ss.xx>`), z. B.

  ```
  [00:12.50]<00:12.50>Die <00:12.80>Straßen <00:13.40>glühen
  [00:16.50]wir haben keinen Plan gemacht
  ```

- `<ID>.json` – komplettes Lyrics-Objekt im Format des Song-Kontexts (`lib/song-context/schema.ts`,
  `lyricsSchema`), z. B. mit Sänger-Zuordnung für Duette.

Nach dem Commit werden die Dateien beim nächsten Deployment aktiv (sie umgehen den Lyrics-Cache).
