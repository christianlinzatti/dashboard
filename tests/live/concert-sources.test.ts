import { describe, expect, it } from "vitest";
import { bandsintown, lastSetlist, ticketmaster } from "@/lib/concerts/providers";

// Echte Konzert-Quellen; laufen nur, wenn die Schlüssel als Secrets hinterlegt sind.
const { TICKETMASTER_API_KEY: tm, BANDSINTOWN_APP_ID: bit, SETLISTFM_API_KEY: sl } = process.env;
const ARTIST = "Coldplay";

describe("Konzert-Quellen (live)", () => {
  it.skipIf(!tm)("Ticketmaster: Antwortformat passt", async () => {
    const events = await ticketmaster(tm!).events(ARTIST);
    expect(Array.isArray(events)).toBe(true);
  });
  it.skipIf(!bit)("Bandsintown: Antwortformat passt", async () => {
    const events = await bandsintown(bit!).events(ARTIST);
    expect(Array.isArray(events)).toBe(true);
  });
  it.skipIf(!sl)("setlist.fm: letzte Setlist", async () => {
    const s = await lastSetlist(sl!, ARTIST);
    expect(s?.songs.length).toBeGreaterThan(0);
  });
});
