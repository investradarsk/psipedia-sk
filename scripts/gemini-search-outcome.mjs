// Only an explicit, machine-readable, safe reason can finish a no-draft run.
const OUTCOMES = new Set(["no_relevant_candidate", "duplicate_only", "insufficient_evidence", "exhausted"]);
export function requiresNoDraftRecovery(conceptCount) {
  return conceptCount === 0;
}
export function parseNoDraftOutcome(text) {
  let value;
  try { value = JSON.parse(text); } catch { throw Error("AGENT_OUTCOME_MISSING"); }
  if (!value || Array.isArray(value) || typeof value !== "object" ||
      Object.keys(value).length !== 1 || !OUTCOMES.has(value.outcome))
    throw Error("AGENT_OUTCOME_MISSING");
  return value.outcome;
}
