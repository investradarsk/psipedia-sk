/** The retired Tavily automation API is intentionally non-operational.
 * D1 history is preserved; the replacement workflows have separate APIs.
 */
export function legacyAutomationRetiredResponse() {
  return Response.json({
    error: "Pôvodné automatizácie boli vyradené. Použi Automatizácie Gemini alebo Kvalitu údajov.",
    replacement: "/admin/automatizacie-gemini",
  }, { status: 410, headers: { "cache-control": "private, no-store" } });
}
