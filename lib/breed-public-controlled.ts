import { env } from "cloudflare:workers";
import { parseBreedControlledValues } from "@/lib/breed-workcopy-controlled.mjs";

// Read only the verified Admin-side sidecar. Public page requests must never
// import Notion, trigger an editor seed or write to canonical breed data.
export async function readPublicBreedControlledValues(breedId:number) {
  const database=(env as unknown as { DB?: D1Database }).DB;
  if (!database || !Number.isSafeInteger(breedId) || breedId<=0) return null;
  try {
    const row=await database.prepare(
      "SELECT values_json FROM breed_notion_controlled_values WHERE breed_id=? LIMIT 1",
    ).bind(breedId).first<{values_json:string}>();
    return row ? parseBreedControlledValues(row.values_json) : null;
  } catch (error) {
    console.warn("breed_public_controlled_read_fallback", {
      breedId, reason:error instanceof Error?error.name:"UNKNOWN",
    });
    return null;
  }
}
