import { resolveGeminiConfig } from "./gemini-automation-client.ts";
import { GeminiAutomationError, type GeminiRuntimeConfig } from "./gemini-automation-types.ts";
import { beginGeminiRun, finishGeminiRun, type GeminiD1 } from "./gemini-automation-store.ts";

/** Foundation only: no cron, Notion, discovery, dedupe or publishing integration. */
export async function runGeminiAutomation(input: {
  database: GeminiD1;
  env: GeminiRuntimeConfig;
  settingId: number;
  triggerType?: "MANUAL" | "SCHEDULED" | "TEST";
  now?: () => Date;
  client?: { generateContent: (payload: never) => Promise<unknown> };
  /** In foundation, this is a no-op service boundary; future phases add operations. */
  execute?: (client: { generateContent: (payload: never) => Promise<unknown> }) => Promise<void>;
}) {
  // Fail closed before any DB write or network request when secret is missing.
  const { model } = resolveGeminiConfig(input.env);
  const now = input.now ?? (() => new Date());
  const id = await beginGeminiRun(input.database, {
    settingId: input.settingId, triggerType: input.triggerType ?? "TEST", model, at: now().toISOString(),
  });
  try {
    if (input.execute) {
      if (!input.client) throw new GeminiAutomationError("CONFIG_MISSING");
      await input.execute(input.client);
    }
    await finishGeminiRun(input.database, { id, status: "SUCCESS", at: now().toISOString() });
    return { id, status: "SUCCESS" as const };
  } catch (error) {
    const code = error instanceof GeminiAutomationError ? error.code : "PROVIDER_ERROR";
    await finishGeminiRun(input.database, { id, status: "FAILED", at: now().toISOString(), errorCode: code });
    return { id, status: "FAILED" as const, errorCode: code };
  }
}
