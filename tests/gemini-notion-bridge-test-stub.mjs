/** Only used by the lifecycle test loader, never by production code. */
export async function ensureDirectoryProfileInNotion(input) {
  if (typeof globalThis.__geminiNotionBridgeTestHook !== "function")
    throw new Error("TEST_NOTION_HOOK_NOT_CONFIGURED");
  return globalThis.__geminiNotionBridgeTestHook(input);
}
