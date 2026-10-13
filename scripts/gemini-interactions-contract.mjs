/**
 * Public Interactions API v1beta wire contract (gemini-3.8-flash).
 * Pure helpers: no network, credentials, logs, or Notion side effects.
 */
export const GEMINI_REQUEST_LIMIT = 9;

export function geminiHttpCode(status, errorBody) {
  // Only inspect provider error metadata for a bounded diagnostic code.
  // Never include its message, raw payload, request, or API key in logs.
  const message = typeof errorBody?.error?.message === "string"
    ? errorBody.error.message.slice(0, 500) : "";
  if (status === 400 && /\bTOOLS\b/i.test(message)) return "GEMINI_HTTP_400_TOOLS";
  return "GEMINI_HTTP_" + (Number.isInteger(status) && status >= 100 && status <= 599 ? status : "ERROR");
}

export function inspectInteraction(value, phase) {
  if (!value || typeof value !== "object" || typeof value.id !== "string" ||
      !value.id.trim() || !Array.isArray(value.steps)) throw Error("GEMINI_INVALID_STEPS");
  if (value.status === "failed") throw Error("GEMINI_STATE_FAILED");
  if (value.status === "incomplete") throw Error("GEMINI_STATE_INCOMPLETE");
  if (value.status === "cancelled") throw Error("GEMINI_STATE_CANCELLED");
  if (value.status === "in_progress") throw Error("GEMINI_STATE_IN_PROGRESS");
  if (value.status !== "requires_action" && value.status !== "completed")
    throw Error("GEMINI_STATE_UNEXPECTED");

  const calls = value.steps.filter(step => step?.type === "function_call");
  const searches = value.steps.filter(step => step?.type === "google_search_call").length;
  if (phase === "research") {
    if (value.status !== "completed" || calls.length) throw Error("GEMINI_RESEARCH_NOT_COMPLETE");
    if (searches < 1) throw Error("GEMINI_SEARCH_NOT_USED");
  } else if (phase === "functions") {
    if (value.status === "requires_action" && !calls.length) throw Error("GEMINI_EMPTY_TOOL_CALL");
    if (value.status === "completed" && calls.length) throw Error("GEMINI_STATE_UNEXPECTED");
    const ids = new Set();
    for (const call of calls) {
      if (typeof call.id !== "string" || !call.id || ids.has(call.id) ||
          !["search_notion", "create_notion_draft"].includes(call.name) ||
          !call.arguments || typeof call.arguments !== "object" ||
          Array.isArray(call.arguments)) throw Error("GEMINI_INVALID_TOOL_CALL");
      ids.add(call.id);
    }
  } else {
    throw Error("GEMINI_INVALID_PHASE");
  }
  return { id: value.id, status: value.status, calls, searches };
}
