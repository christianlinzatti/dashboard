/** Heimatort für den Konzert-Umkreis (Standard: Wien), per Env änderbar. */
export function home() {
  const lat = Number(process.env.HOME_LAT);
  const lon = Number(process.env.HOME_LON);
  return {
    name: process.env.HOME_LOCATION ?? "Wien",
    lat: Number.isFinite(lat) && process.env.HOME_LAT ? lat : 48.2082,
    lon: Number.isFinite(lon) && process.env.HOME_LON ? lon : 16.3738,
    radiusKm: Number(process.env.CONCERT_RADIUS_KM) || 200,
  };
}

/** Luftlinie in km (Haversine). */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
