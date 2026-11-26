import { describe, expect, it, vi } from "vitest";
import { followArtist } from "@/lib/personal/spotify-library";

describe("Künstler folgen (Spotify)", () => {
  it("neuer Bibliotheks-Endpunkt, sonst /me/following; fehlende Berechtigung erkannt", async () => {
    const ok = vi.fn(async () => new Response(null, { status: 200 }));
    expect(await followArtist(ok, "0OdUWJ0sBjDrqHygGUXeCF", true)).toBe(true);
    expect(ok).toHaveBeenCalledWith("/me/library?uris=spotify%3Aartist%3A0OdUWJ0sBjDrqHygGUXeCF", { method: "PUT" });

    const fallback = vi.fn(async (p: string) => new Response(null, { status: p.startsWith("/me/library") ? 404 : 204 }));
    expect(await followArtist(fallback, "0OdUWJ0sBjDrqHygGUXeCF", false)).toBe(true);
    expect(fallback).toHaveBeenLastCalledWith("/me/following?type=artist&ids=0OdUWJ0sBjDrqHygGUXeCF", { method: "DELETE" });

    const denied = vi.fn(async () => new Response(null, { status: 403 }));
    expect(await followArtist(denied, "0OdUWJ0sBjDrqHygGUXeCF", true)).toBe("scope");
    expect(await followArtist(denied, "kaputt!", true)).toBe(false);
  });
});
