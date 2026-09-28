import { env } from "cloudflare:workers";
import { hashPii, normalizeEmail } from "@/lib/pii-crypto";

type AuditIdentityEnv = { PII_HASH_KEY?: string };

export async function adminAuditActorRef(email: string) {
  const hashKey = (env as unknown as AuditIdentityEnv).PII_HASH_KEY?.trim();
  if (!hashKey) throw new Error("PII_HASH_KEY is not configured");
  return `admin:${await hashPii(normalizeEmail(email), hashKey)}`;
}
