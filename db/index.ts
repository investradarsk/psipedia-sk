import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as coreSchema from "./schema";
import * as geoSchema from "./geo-schema";
import * as partnerSchema from "./partner-schema";
import * as reviewSchema from "./review-schema";

const schema = { ...coreSchema, ...geoSchema, ...partnerSchema, ...reviewSchema };

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}
