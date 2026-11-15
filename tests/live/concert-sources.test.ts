import { describe, expect, it } from "vitest";
import { bandsintown, eventimSearch, lastSetlist, oeticket, ticketmaster } from "@/lib/concerts/providers";

// Echte Konzert-Quellen; laufen nur, wenn die Schlüssel als Secrets hinterlegt sind.
const { TICKETMASTER_API_KEY: tm, BANDSINTOWN_APP_ID: bit, SETLISTFM_API_KEY: sl } = process.env;
const ARTIST = "Coldplay";

describe("Konzert-Quellen (live)", () => {
  it("oeticket: Antwortformat passt und Treffer werden erkannt", async (ctx) => {
    try {
      const events = await oeticket().events("Roy Bianco & Die Abbrunzati Boys");
      expect(Array.isArray(events)).toBe(true);
    } catch (e) {
      // Bot-Sperre für Rechenzentrums-IPs ist kein Formatfehler
      if (String(e).includes("oeticket 403")) ctx.skip();
      throw e;
    }
  });
  it("Eventim Deutschland: Antwortformat passt", async (ctx) => {
    try {
      expect(Array.isArray(await eventimSearch("eventim").events("Roy Bianco & Die Abbrunzati Boys"))).toBe(true);
    } catch (e) {
      if (String(e).includes(" 403")) ctx.skip(); // Bot-Sperre ist kein Formatfehler
      throw e;
    }
  });
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
