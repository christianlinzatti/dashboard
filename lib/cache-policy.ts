/**
 * Alle Cache-Haltedauern an einem Ort (Sekunden bzw. Millisekunden).
 * Ausgelegt auf den kostenlosen Upstash-Tarif (256 MB, 500 000 Befehle/Monat):
 * große Einträge werden komprimiert, der Dashboard-Stand wird sparsam gemeldet.
 */
const DAY = 24 * 3600;

export const CACHE_TTL = {
  /** Lyrics ändern sich praktisch nie; neue Provider erzeugen ohnehin einen neuen Schlüssel */
  lyricsFound: 180 * DAY,
  /** „Keine Lyrics“ – später können Provider sie nachliefern */
  lyricsMissing: 3 * DAY,
  /** Wikipedia-Texte und Fotos ändern sich langsam */
  infoFound: 30 * DAY,
  infoMissing: 3 * DAY,
  /** Konzerttermine: neue Termine/Ausverkauft-Status ändern sich laufend */
  concerts: 12 * 3600,
  /** Teilergebnis (eine Konzert-Quelle ausgefallen/gesperrt): bald neu versuchen, aber nicht bei jedem Song */
  concertsPartial: 30 * 60,
  /** letzte Setlist einer Tour */
  setlist: 3 * DAY,
  /** Hörstand für Alexa – persönliche Daten, bewusst kurz */
  snapshot: 2 * 3600,
  /** nicht abgeholte Befehle verfallen */
  commands: 5 * 60,
} as const;

/** Wie oft das Dashboard seinen Stand meldet (Songwechsel, Abschnitt, Pause zusätzlich sofort). */
export const REPORT_INTERVAL_MS = { playing: 15_000, idle: 60_000 } as const;

/** Ab welchem Alter Alexa den Stand als „Dashboard nicht aktiv“ wertet (> längstes Meldeintervall). */
export const SNAPSHOT_STALE_MS = 90_000;
