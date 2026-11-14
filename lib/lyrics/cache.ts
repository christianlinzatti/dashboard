/**
 * Cache für Lyrics: Upstash Redis (über REST, wenn konfiguriert), sonst im Speicher.
 * Vercel-Marketplace setzt KV_REST_API_URL/TOKEN bzw. UPSTASH_REDIS_REST_URL/TOKEN.
 */
export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

export function memoryCache(max = 300): Cache {
  const m = new Map<string, { v: unknown; until: number }>();
  return {
    async get<T>(key: string) {
      const e = m.get(key);
      if (!e || e.until < Date.now()) return null;
      m.delete(key); // LRU: ans Ende
      m.set(key, e);
      return e.v as T;
    },
    async set(key, v, ttl) {
      m.set(key, { v, until: Date.now() + ttl * 1000 });
      while (m.size > max) m.delete(m.keys().next().value!);
    },
  };
}

export function upstashCache(url: string, token: string, fetchImpl: typeof fetch = fetch): Cache {
  const cmd = async (args: unknown[]) => {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Redis ${res.status}`);
    return ((await res.json()) as { result: unknown }).result;
  };
  return {
    async get<T>(key: string) {
      const r = await cmd(["GET", key]).catch(() => null);
      return typeof r === "string" ? (JSON.parse(r) as T) : null;
    },
    async set(key, value, ttl) {
      await cmd(["SET", key, JSON.stringify(value), "EX", ttl]).catch(() => undefined);
    },
  };
}

let shared: Cache | undefined;
export function getCache(): Cache {
  if (shared) return shared;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  shared = url && token ? upstashCache(url, token) : memoryCache();
  return shared;
}
