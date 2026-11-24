import "server-only";
import { randomBytes } from "node:crypto";
import { memoryCache, upstashCache, type Cache } from "@/lib/lyrics/cache";

/** Erinnerungsfotos: 24 h abrufbar, unter einer zufälligen, nicht erratbaren Adresse (128 Bit) */
export const PHOTO_TTL_S = 24 * 3600;
/** größtes Foto (JPEG); passt mit Base64 sicher unter die 1-MB-Grenze von Upstash */
export const PHOTO_MAX_BYTES = 700_000;
export const PHOTO_ID = /^[A-Za-z0-9_-]{22}$/;

const key = (id: string) => `foto:${id}`;
const galleryKey = (id: string) => `fotogalerie:${id}`;
/** höchstens so viele Fotos in einer Galerie */
export const GALLERY_MAX = 30;

/** JPEG erkennen (Anfang FF D8 FF) – nur Fotos, keine beliebigen Dateien */
export const isJpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

export function createPhotoStore(cache: Cache) {
  return {
    async put(bytes: Uint8Array): Promise<string> {
      const id = randomBytes(16).toString("base64url");
      await cache.set(key(id), Buffer.from(bytes).toString("base64"), PHOTO_TTL_S);
      return id;
    },
    async get(id: string): Promise<Buffer | null> {
      if (!PHOTO_ID.test(id)) return null;
      const b64 = await cache.get<string>(key(id));
      return b64 ? Buffer.from(b64, "base64") : null;
    },
    /** Galerie des Abends: nur die Adressen der Fotos (die Fotos selbst liegen schon einzeln da) */
    async putGallery(ids: readonly string[]): Promise<string> {
      const id = randomBytes(16).toString("base64url");
      await cache.set(galleryKey(id), ids.filter((x) => PHOTO_ID.test(x)).slice(0, GALLERY_MAX), PHOTO_TTL_S);
      return id;
    },
    async getGallery(id: string): Promise<string[] | null> {
      if (!PHOTO_ID.test(id)) return null;
      const ids = await cache.get<string[]>(galleryKey(id));
      return Array.isArray(ids) ? ids.filter((x) => typeof x === "string" && PHOTO_ID.test(x)) : null;
    },
  };
}

let shared: ReturnType<typeof createPhotoStore> | undefined;
/** Gemeinsamer Speicher: Upstash (längeres Zeitlimit als für Lyrics – ein Foto ist größer), sonst im Speicher */
export function photoStore() {
  if (shared) return shared;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  shared = createPhotoStore(url && token ? upstashCache(url, token, fetch, 8000) : memoryCache(50));
  return shared;
}
