import type { SectionKind } from "./schema";

/** Typisierte Ereignisse des Song-Kontexts. Directors reagieren darauf. */
export type SongEvents = {
  trackChanged: { trackKey: string | null };
  lyricsReady: { quality: string };
  lineChanged: { lineIdx: number };
  sectionChanged: { section: SectionKind | null };
  chorusStart: Record<string, never>;
  singerChanged: { artistId: string | undefined };
  paused: Record<string, never>;
  resumed: Record<string, never>;
};

type Handler<T> = (payload: T) => void;

export function createEmitter<E extends Record<string, unknown>>() {
  const handlers = new Map<keyof E, Set<Handler<never>>>();
  return {
    on<K extends keyof E>(type: K, fn: Handler<E[K]>): () => void {
      let set = handlers.get(type);
      if (!set) handlers.set(type, (set = new Set()));
      set.add(fn as Handler<never>);
      return () => set.delete(fn as Handler<never>);
    },
    emit<K extends keyof E>(type: K, payload: E[K]) {
      handlers.get(type)?.forEach((fn) => (fn as Handler<E[K]>)(payload));
    },
  };
}
