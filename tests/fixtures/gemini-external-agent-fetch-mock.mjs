/**
 * Loaded with node --import BEFORE the worker. All fetch calls are intercepted;
 * no network and no real Gemini, Notion or Psipedia API requests are possible.
 */
import { createHmac } from "node:crypto";

const scenario = process.env.MOCK_SCENARIO ?? "success";
let geminiCalls = 0;
let notionPosts = 0;
let callbacks = 0;
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "content-type": "application/json" },
});
const step = (name, id, args = {}) => ({
  type: "function_call", name, id, arguments: args,
});
const ds = "84e0664c-ca47-405f-9d54-31b20287bc8c";
const properties = {
  "Názov": { type: "title" },
  "Kategória": { type: "rich_text" },
  "Psipedia stav": { type: "select", select: { options: [{ name: "Koncept" }] } },
  "Zdroj dát": { type: "url" },
  "Mesto": { type: "rich_text" },
  "Web": { type: "url" },
  "Vytvoril": { type: "rich_text" },
};
globalThis.fetch = async (url, options = {}) => {
  const address = String(url);
  if (address === "https://generativelanguage.googleapis.com/v1beta/interactions") {
    geminiCalls++;
    const body = JSON.parse(options.body);
    if (body.model !== "gemini-3.8-flash") throw Error("WRONG_MODEL");
    if (geminiCalls === 1) {
      if (body.tools?.length !== 1 || body.tools[0].type !== "google_search")
        throw Error("SEARCH_NOT_ISOLATED");
      if (scenario === "http_400_tools")
        return json({ error: { status: "INVALID_ARGUMENT", message: "TOOLS unsupported combination" } }, 400);
      if (scenario === "in_progress")
        return json({ id: "research-1", status: "in_progress", steps: [] });
      return json({
        id: "research-1", status: "completed",
        steps: scenario === "missing_search" ? [] : [
          { type: "google_search_call", queries: ["mock query"] },
          { type: "model_output", content: [{ type: "text", text: "Mock public source" }] },
        ],
      });
    }
    if (body.tools?.some(tool => tool.type !== "function"))
      throw Error("MIXED_TOOL_REQUEST");
    if (body.previous_interaction_id !== (geminiCalls === 2 ? "research-1" : "functions-" + (geminiCalls - 2)))
      throw Error("WRONG_PREVIOUS_INTERACTION");
    if (geminiCalls === 2) {
      if (scenario === "unknown_tool")
        return json({ id: "functions-1", status: "requires_action", steps: [step("not_allowed", "call-a")] });
      if (scenario === "empty_action")
        return json({ id: "functions-1", status: "requires_action", steps: [] });
      if (scenario === "out_of_order")
        return json({ id: "functions-1", status: "requires_action", steps: [step("create_notion_draft", "call-a", {
          name: "Test Veterinár", source_url: "https://example.com", city: "Sereď",
        })] });
      return json({ id: "functions-1", status: "requires_action", steps: [
        step("search_notion", "call-a", { query: "Test Veterinár" }),
      ] });
    }
    if (geminiCalls === 3) {
      const inputText = JSON.stringify(body.input);
      if (scenario === "out_of_order") {
        if (!inputText.includes("search_notion_required_first")) throw Error("MISSING_SEARCH_GATE");
        return json({ id: "functions-2", status: "completed", steps: [] });
      }
      if (scenario === "invalid_call")
        return json({ id: "functions-2", status: "requires_action", steps: [
          step("create_notion_draft", "", { name: "Test Veterinár" }),
        ] });
      return json({ id: "functions-2", status: "requires_action", steps: [
        step("create_notion_draft", "call-b", {
          name: "Test Veterinár", city: "Sereď", source_url: "https://example.com/about",
          website_url: "https://example.com", phone: "+421 905 123 456",
          email: "clinic@example.com", description: "Mock service",
        }),
      ] });
    }
    if (geminiCalls === 4)
      return json({ id: "functions-3", status: "completed", steps: [
        { type: "model_output", content: [{ type: "text", text: "Done" }] },
      ] });
    throw Error("EXTRA_GEMINI_REQUEST");
  }
  if (address.startsWith("https://api.notion.com/v1/")) {
    if (address === "https://api.notion.com/v1/data_sources/" + ds)
      return json({ properties });
    if (address === "https://api.notion.com/v1/data_sources/" + ds + "/query")
      return json({ results: [], has_more: false });
    if (address === "https://api.notion.com/v1/pages") {
      notionPosts++;
      const body = JSON.parse(options.body);
      if (body.parent?.data_source_id !== ds ||
          body.properties?.["Psipedia stav"]?.select?.name !== "Koncept" ||
          body.properties?.["Stav"]?.select?.name === "Publikované")
        throw Error("NOT_DRAFT_ONLY");
      if (scenario === "notion_uncertain") throw Error("SIMULATED_POST_TIMEOUT");
      return json({ id: "mock-notion-page", properties: body.properties });
    }
    throw Error("UNEXPECTED_NOTION_ENDPOINT");
  }
  if (address === "https://psipedia.sk/api/internal/gemini-agent/callback") {
    callbacks++;
    const expected = "sha256=" + createHmac("sha256", process.env.PSIPEDIA_AGENT_CALLBACK_SECRET)
      .update(options.body).digest("hex");
    if (options.headers["X-Psipedia-Signature"] !== expected)
      throw Error("INVALID_CALLBACK_SIGNATURE");
    const payload = JSON.parse(options.body);
    console.log("MOCK_CALLBACK " + JSON.stringify(payload));
    if (scenario === "callback_503") return json({ ok: false }, 503);
    return json({ ok: true });
  }
  throw Error("UNEXPECTED_NETWORK_HOST");
};
process.on("exit", () => {
  console.log("MOCK_COUNTS " + JSON.stringify({ geminiCalls, notionPosts, callbacks }));
});
