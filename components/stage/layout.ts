/** Feste Maße der Bühne, die mehrere Teile teilen (Traverse über der Bühne, Rückwand dahinter). */
export const TRUSS_Y = 4.3;
export const TRUSS_Z = -2.6;

/**
 * Ebene für Feinheiten, die die Live-Bildschirme nicht mitfilmen (zu klein für deren Auflösung, z. B. Staub in den
 * Lichtkegeln): die Hauptkamera sieht Ebene 0 und diese, die Kamera der Bildschirme nur Ebene 0. Spart Zeichenaufrufe.
 */
export const NOT_ON_SCREENS = 1;
