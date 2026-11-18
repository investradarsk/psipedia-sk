/** Read-only public detail facts backed by canonical Services V3 choices.
 * Never infer yes/no from legacy source_data_json, editorial text, or missing rows.
 * Services V3 remains the only writable owner of these tri-state properties.
 */
import { attributeCatalog } from "./service-catalog-contract.ts";
import type { ProfileReviewReadDatabase } from "./profile-review-read.ts";

type DB = ProfileReviewReadDatabase;
export type DirectoryPublicCatalogAttribute = Readonly<{ label: string; value: "Áno" | "Nie" }>;

export function presentDirectoryCatalogAttributes(
  category: string,
  selections: readonly Readonly<{ option_id: string; choice: string }>[],
): DirectoryPublicCatalogAttribute[] {
  const choices = new Map(selections.map((selection) => [selection.option_id, selection.choice]));
  return attributeCatalog
    .filter((definition) => definition.valueKind === "tri_state" && definition.categories.some((item) => item === category))
    .flatMap((definition) => {
      const choice = choices.get(definition.id);
      return choice === "yes" || choice === "no"
        ? [{ label: definition.label, value: choice === "yes" ? "Áno" as const : "Nie" as const }]
        : [];
    });
}

export async function getPublicDirectoryCatalogAttributes(
  database: DB,
  profileId: number,
  category: string,
): Promise<DirectoryPublicCatalogAttribute[]> {
  const selections = await database.prepare(
    "SELECT option_id,choice FROM service_profile_option_choices WHERE profile_id=?1 AND choice IN ('yes','no')",
  ).bind(profileId).all<{ option_id: string; choice: string }>();
  return presentDirectoryCatalogAttributes(category, selections.results ?? []);
}
