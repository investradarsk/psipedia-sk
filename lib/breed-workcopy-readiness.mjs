/**
 * Production D1 readback is a prerequisite, NOT evidence that Notion fields
 * actually round-trip. Pure helper to keep Admin status and tests aligned.
 * Never triggers writes, activation or automated reconciliation.
 */
export function assessBreedWorkcopyReadiness(input) {
  const {
    total, active, shadow, verified, receiptPrefixes, activeErrors,
    oldSyncEnabled, workCopySyncEnabled, activationEnabled,
  } = input;
  const activeCohortReady =
    total === 344 && active === 344 && shadow === 0 &&
    verified === 0 && receiptPrefixes === 344;
  const singleNewEngine =
    !oldSyncEnabled && workCopySyncEnabled && !activationEnabled;

  const blockers = [];
  if (total !== 344) blockers.push("BREED_LINK_COUNT_MISMATCH");
  if (active !== 344 || shadow !== 0 || verified !== 0)
    blockers.push("BREED_ACTIVE_COHORT_INCOMPLETE");
  if (receiptPrefixes !== 344)
    blockers.push("BREED_FIELD_RECEIPTS_INCOMPLETE");
  if (!singleNewEngine) blockers.push("BREED_SYNC_FLAGS_MISMATCH");
  if (activeErrors > 0) blockers.push("BREED_ACTIVE_FIELD_ERRORS");

  return {
    activeCohortReady,
    singleNewEngine,
    readyForManualRoundtrip: blockers.length === 0,
    blockers,
  };
}
