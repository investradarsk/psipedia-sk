/**
 * A new 60-field baseline is NOT a copy of a historical 109-field receipt.
 * Store the independent values observed on each side, without choosing a
 * winner, erasing differences or touching the original rollback receipt.
 */
export function encodeIndependentBreedWorkCopyReceipt(notion, admin) {
  if (!notion || !admin || typeof notion !== "object" ||
    typeof admin !== "object" || Array.isArray(notion) || Array.isArray(admin) ||
    !Object.keys(notion).length || !Object.keys(admin).length)
    throw Error("BREED_WORKCOPY_BASELINE_EMPTY");
  return "breed-field-v1:" + JSON.stringify({
    hash: "0".repeat(64),
    notion: JSON.stringify(notion),
    admin: JSON.stringify(admin),
  });
}
