import { describe, expect, it } from "vitest";
import { mergeReminders, remindersFrom, upcomingReminders, type Reminder } from "@/lib/concerts/reminders";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";
import type { Concert, SongStatic } from "@/lib/song-context/schema";

const concert = (p: Partial<Concert>): Concert =>
  ({
    artistId: "a",
    artistName: "Wanda",
    date: "2026-12-19",
    venue: "Stadthalle",
    city: "Wien",
    distanceKm: 3,
    providers: ["oeticket"],
    ...p,
  }) as Concert;
const song = (concerts: Concert[], user: SongStatic["user"]): SongStatic =>
  ({ ...neonlicht, concerts, concertArea: { name: "Wien", radiusKm: 200 }, user }) as SongStatic;

describe("Konzert-Erinnerung", () => {
  const today = "2026-11-24";
  it("nur im Umkreis und nur bei gefolgten Künstlern oder gemochten Songs", () => {
    const list = [
      concert({}),
      concert({ artistId: "b", artistName: "Gast", city: "Linz", distanceKm: 155 }),
      concert({ city: "Berlin", distanceKm: 523 }),
      concert({ city: "Graz", distanceKm: undefined }),
      concert({ date: "2026-11-01" }),
    ];
    expect(remindersFrom(song(list, { artists: {} }), today)).toEqual([]);
    const follows = remindersFrom(song(list, { artists: { a: { following: true } } }), today);
    expect(follows.map((r) => [r.city, r.reason])).toEqual([["Wien", "folgst"]]);
    const liked = remindersFrom(song(list, { trackSaved: true, artists: {} }), today);
    expect(liked.map((r) => [r.city, r.reason])).toEqual([
      ["Wien", "magst"],
      ["Linz", "magst"],
    ]);
  });

  it("zusammenführen: Neues ersetzt Altes, Vergangenes fällt weg; Startbildschirm nur die nächsten 120 Tage", () => {
    const r = (date: string, city = "Wien", extra: Partial<Reminder> = {}): Reminder => ({
      key: `Wanda|${date}|${city.toLowerCase()}`,
      artistName: "Wanda",
      date,
      city,
      venue: "V",
      reason: "folgst",
      ...extra,
    });
    const merged = mergeReminders(
      [r("2026-11-01"), r("2027-01-10")],
      [r("2027-01-10", "Wien", { soldOut: true }), r("2026-12-19")],
      today,
    );
    expect(merged.map((x) => [x.date, !!x.soldOut])).toEqual([
      ["2026-12-19", false],
      ["2027-01-10", true],
    ]);
    expect(upcomingReminders([...merged, r("2027-09-01")], today).map((x) => x.date)).toEqual(["2026-12-19", "2027-01-10"]);
  });
});
