import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** AES-256-GCM: verschlüsselt + authentifiziert (Manipulation wird erkannt). */
function key(secret: string) {
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET fehlt oder ist kürzer als 32 Zeichen");
  return createHash("sha256").update(secret).digest();
}

export function seal(data: unknown, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

export function unseal<T>(token: string | undefined, secret: string): T | null {
  if (!token) return null;
  try {
    const [iv, tag, body] = token.split(".").map((p) => Buffer.from(p, "base64url"));
    if (!iv || !tag || !body) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(secret), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8")) as T;
  } catch {
    return null;
  }
}

/** PKCE: zufälliger Verifier + S256-Challenge. */
export function pkcePair() {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function randomState() {
  return randomBytes(16).toString("base64url");
}
