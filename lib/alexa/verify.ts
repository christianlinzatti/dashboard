import { createVerify, X509Certificate } from "node:crypto";
import { rootCertificates } from "node:tls";

/**
 * Prüfung von Alexa-Anfragen nach Amazons Vorgaben für selbst gehostete Skills:
 * Zertifikats-URL, Zertifikatskette, Gültigkeit, SAN „echo-api.amazon.com“, Signatur über den
 * Rohinhalt (SHA-256) und Zeitstempel (max. 150 s).
 */
export class AlexaVerificationError extends Error {}

const MAX_AGE_MS = 150_000;
const SAN = "echo-api.amazon.com";

export function isValidCertUrl(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    const path = new URL(u.pathname, "https://x").pathname; // normalisiert „..“
    return (
      u.protocol === "https:" &&
      u.hostname.toLowerCase() === "s3.amazonaws.com" &&
      (u.port === "" || u.port === "443") &&
      path.startsWith("/echo.api/")
    );
  } catch {
    return false;
  }
}

export function splitPemChain(pem: string): X509Certificate[] {
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
  return blocks.map((b) => new X509Certificate(b));
}

let defaultRoots: X509Certificate[] | undefined;
const trustedRoots = () => (defaultRoots ??= rootCertificates.map((p) => new X509Certificate(p)));

export function verifyChain(chain: X509Certificate[], now: Date, roots: X509Certificate[] = trustedRoots()) {
  const leaf = chain[0];
  if (!leaf) throw new AlexaVerificationError("Leere Zertifikatskette");
  const t = now.getTime();
  for (const c of chain) {
    if (t < Date.parse(c.validFrom) || t > Date.parse(c.validTo))
      throw new AlexaVerificationError("Zertifikat abgelaufen oder noch nicht gültig");
  }
  const sans = (leaf.subjectAltName ?? "").split(",").map((s) => s.trim().toLowerCase());
  if (!sans.includes(`dns:${SAN}`)) throw new AlexaVerificationError("Zertifikat nicht für echo-api.amazon.com");
  for (let i = 0; i < chain.length - 1; i++) {
    const [child, parent] = [chain[i]!, chain[i + 1]!];
    if (!child.checkIssued(parent) || !child.verify(parent.publicKey))
      throw new AlexaVerificationError("Zertifikatskette ungültig");
  }
  const top = chain.at(-1)!;
  const anchored = roots.some((r) => top.fingerprint256 === r.fingerprint256 || (top.checkIssued(r) && top.verify(r.publicKey)));
  if (!anchored) throw new AlexaVerificationError("Zertifikatskette nicht vertrauenswürdig");
  return leaf;
}

export type VerifyDeps = {
  fetchCertChain: (url: string) => Promise<string>;
  now?: () => Date;
  roots?: X509Certificate[];
};

const certCache = new Map<string, { pem: string; until: number }>();

/** Zertifikatskette laden (mit Cache, Amazon nutzt dieselbe Kette über längere Zeit). */
export async function defaultFetchCertChain(url: string) {
  const hit = certCache.get(url);
  if (hit && hit.until > Date.now()) return hit.pem;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new AlexaVerificationError(`Zertifikat nicht ladbar (${res.status})`);
  const pem = await res.text();
  certCache.set(url, { pem, until: Date.now() + 3600_000 });
  return pem;
}

export async function verifyAlexaRequest(
  headers: { certUrl: string | null; signature256: string | null },
  rawBody: string,
  timestamp: string | undefined,
  deps: VerifyDeps,
) {
  const now = deps.now?.() ?? new Date();
  if (!isValidCertUrl(headers.certUrl)) throw new AlexaVerificationError("Ungültige Zertifikats-URL");
  if (!headers.signature256) throw new AlexaVerificationError("Signatur fehlt");
  if (!timestamp || Math.abs(now.getTime() - Date.parse(timestamp)) > MAX_AGE_MS) {
    throw new AlexaVerificationError("Anfrage zu alt");
  }
  const leaf = verifyChain(splitPemChain(await deps.fetchCertChain(headers.certUrl!)), now, deps.roots);
  const ok = createVerify("RSA-SHA256").update(rawBody, "utf8").verify(leaf.publicKey, headers.signature256, "base64");
  if (!ok) throw new AlexaVerificationError("Signatur ungültig");
}
