/**
 * Initial Gemini Google Search research only. No general workflow/interaction retry:
 * caller must permit retry only before any potential Notion or concept write.
 * request() must independently charge and enforce the global request budget.
 */
export async function retryInitialResearch503({ request, canRetry, wait }) {
  let retries = 0;
  for (;;) {
    try {
      return await request();
    } catch (error) {
      if (error?.message !== "GEMINI_HTTP_503" || retries >= 2 || !canRetry())
        throw error;
      await wait(400 * (2 ** retries));
      retries++;
    }
  }
}
