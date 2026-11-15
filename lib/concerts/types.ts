/** Rohtermin eines Konzert-Providers (vor dem Zusammenführen). */
export type RawEvent = {
  provider: string;
  artistName: string;
  date: string; // JJJJ-MM-TT
  time?: string; // HH:MM
  venue: string;
  city: string;
  country?: string;
  lat?: number;
  lon?: number;
  ticketUrl?: string;
  soldOut?: boolean;
  cancelled?: boolean;
  /** Koordinaten per Geocoding ergänzt (OpenStreetMap, Quellenangabe nötig) */
  geocoded?: boolean;
};

export interface ConcertProvider {
  id: string;
  /** kleiner = bevorzugte Ticket-Quelle beim Zusammenführen */
  ticketPriority: number;
  events(artistName: string, signal?: AbortSignal): Promise<RawEvent[]>;
}
