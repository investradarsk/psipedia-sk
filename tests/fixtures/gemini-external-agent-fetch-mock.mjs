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
const lostFound = process.env.AGENT_STABLE_KEY === "help.stratene-a-najdene";
const ds = lostFound ? "3ed793fc-1d18-8122-95b9-000b05c3c6bd" : "84e0664c-ca47-405f-9d54-31b20287bc8c";
const canonicalDb = "811d0659-7217-4914-a27c-1cd67bda3e0e";
const localToday = new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Bratislava",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
let scans = 0;
const section = process.env.AGENT_STABLE_KEY.split(".")[0];
const shelter = process.env.AGENT_STABLE_KEY === "help.utulky";
const adoption = process.env.AGENT_STABLE_KEY === "help.adopcia";
const categoryArgs = {
  name: "Mock candidate", city: "Sereď", source_url: "https://example.com/about",
  summary: "Overený prípad", description: "Dostatočne podrobný popis overeného podujatia alebo prípadu pomoci.",
  organizer: "Organizátor", start_date: "2099-10-20", start_time: "10:00", end_time: "12:00",
  evidence: [{ source_url: "https://example.com/about", fields: section === "events"
    ? ["name", "description", "source_url", "organizer", "start_date", "city", "start_time", "end_time"]
    : ["name", "description", "source_url", "city"] }],
};
if (lostFound) {
  for (const field of ["organizer", "start_date", "start_time", "end_time"]) delete categoryArgs[field];
  Object.assign(categoryArgs, {
    report_type: scenario === "lost_found" ? "NÁJDENÝ" : "STRATENÝ",
    report_status: scenario === "lost_resolved" ? "RESOLVED" : "OPEN",
    name: "Stratený čierny labrador Nitra", dog_name: "Neo",
    breed: "Labrador", color: "čierny",
    distinguishing_marks: "biela škvrna na hrudi", city: "Nitra",
    summary: "Aktuálne hlásenie čierneho labradora v Nitre.",
    description: "Čierny labrador s bielou škvrnou na hrudi. Prípad stále aktívny podľa verejného hlásenia.",
    event_date: scenario === "lost_stale" ? "2023-01-01" : localToday,
    verified_at: localToday,
  });
  categoryArgs.evidence=[{source_url:"https://example.com/about",
    fields:["report_type","report_status","name","dog_name","breed","color","distinguishing_marks",
      "city","summary","description","event_date","verified_at","source_url"]}];
  if (scenario === "lost_private") categoryArgs.phone="+421 905 123 456";
  if (scenario === "lost_gps") categoryArgs.latitude=48.123456;
  if (scenario === "lost_private_text") categoryArgs.description="Presné súradnice GPS: 48.123456, 18.123456. Kontaktujte majiteľa.";
}
if (adoption) {
  categoryArgs.name = "Nový psík";
  categoryArgs.organization = "Útulok Test";
  categoryArgs.summary = "Psík čaká na zodpovednú adopciu.";
  categoryArgs.description = "Pes je v starostlivosti útulku a hľadá bezpečný nový domov po preverení dostupných informácií.";
  categoryArgs.evidence = [{ source_url: "https://example.com/about",
    fields: ["name", "organization", "summary", "description", "city"] }];
  if (scenario === "adoption_private") categoryArgs.phone="+421 905 123 456";
}
if (shelter) {
  categoryArgs.summary="Overený opis útulku";
  categoryArgs.description="Organizácia sa zaoberá starostlivosťou o opustené zvieratá a prevádzkou útulku.";
  categoryArgs.website_url="https://example.com";
  categoryArgs.evidence=[{source_url:"https://example.com/about",fields:["name","summary","description","city","website_url"]}];
  if (scenario === "shelter_unverified") categoryArgs.email="private@example.com";
  if (scenario === "shelter_private") categoryArgs.description="Organizácia prevádzkuje útulok na ulici Hlavná 42 a poskytuje starostlivosť.";
}
if (scenario === "ungrounded") categoryArgs.source_url = "https://unverified.example/about";
if (scenario === "missing_source") delete categoryArgs.source_url;
if (scenario === "invalid_source") categoryArgs.source_url = "http://example.com/about";
if (scenario === "missing_evidence") delete categoryArgs.evidence;
if (scenario === "missing_organizer") delete categoryArgs.organizer;
const properties = {
  "Názov": { type: "title" },
  "Kategória": { type: "rich_text" },
  "Psipedia stav": { type: "select", select: { options: [{ name: "Koncept" }] } },
  "Stav": { type: "select", select: { options: [{ name: "Na kontrolu" }, { name: "Publikované" }] } },
  "Zdroj dát": { type: "url" },
  "Mesto": { type: "rich_text" },
  "Web": { type: "url" },
  "Telefón": { type: "phone_number" },
  "E-mail": { type: "email" },
  "Vytvoril": { type: "rich_text" },
};
const categoryProperties = {
  "Názov": { type: "title" }, "Perex": { type: "rich_text" }, "Popis": { type: "rich_text" },
  "Mesto": { type: "rich_text" },
  ...(section === "events" ? {
    "Typ podujatia": { type: "rich_text" }, "Začiatok": { type: "date" },
    "Čas začiatku": { type: "rich_text" }, "Čas konca": { type: "rich_text" },
    "Organizátor": { type: "rich_text" }, "Web": { type: "url" }, "Zdroj dát": { type: "url" },
    "Stav": { type: "select", select: { options: [{ name: "Nápad" }, { name: "Publikované" }] } },
  } : { "Kategória": { type: "rich_text" }, "Psipedia stav": { type: "rich_text" } }),
};
const shelterProperties = {
  "Názov":{type:"title"}, "Typ":{type:"rich_text"},
  "Stav":{type:"select",select:{options:[{name:"Nápad"},{name:"Publikované"}]}},
  "Právny názov":{type:"rich_text"}, "IČO / registračné číslo":{type:"rich_text"},
  "Psipedia ID":{type:"rich_text"}, "Mesto":{type:"rich_text"}, "Kraj":{type:"rich_text"},
  "Web":{type:"url"}, "Zdroj dát":{type:"url"}, "Popis":{type:"rich_text"},
  "Krátky popis":{type:"rich_text"}, "Facebook":{type:"url"}, "Instagram":{type:"url"},
};
const adoptionProperties = {
  "Meno": {type:"title"}, "Organizácia": {type:"rich_text"},
  "Stav": {type:"select",select:{options:[{name:"Nápad"},{name:"Ready"},{name:"Publikované"}]}},
  "Krátky popis": {type:"rich_text"}, "Popis": {type:"rich_text"},
  "Mesto": {type:"rich_text"}, "Kraj": {type:"rich_text"},
  "Zdroj dát": {type:"url"}, "Psipedia ID": {type:"rich_text"}, "Slug": {type:"rich_text"},
};
const lostFoundProperties = {
  "Názov": {type:"title"}, "Typ": {type:"rich_text"}, "Psipedia stav": {type:"rich_text"},
  "Meno psa": {type:"rich_text"}, "Mesto": {type:"rich_text"},
  "Dátum udalosti": {type:"date"}, "Popis": {type:"rich_text"},
  "Rozlišovacie znaky": {type:"rich_text"}, "Zdroj URL": {type:"url"},
  "Psipedia ID": {type:"rich_text"}, "URL Psipedia": {type:"url"},
  "Slug": {type:"rich_text"}, "Vyriešené": {type:"date"}, "Expirácia": {type:"date"},
  "Latitude": {type:"number"}, "Longitude": {type:"number"},
  "Pohlavie": {type:"rich_text"}, "Plemeno": {type:"rich_text"},
  "Farba": {type:"rich_text"}, "Veľkosť": {type:"rich_text"},
  "Obojok": {type:"rich_text"}, "Okres": {type:"rich_text"}, "Kraj": {type:"rich_text"},
};
if (lostFound && scenario === "wrong_type") lostFoundProperties.Typ={type:"select"};
if (adoption && scenario === "wrong_type") adoptionProperties.Organizácia={type:"select"};
if (shelter && scenario === "wrong_type") shelterProperties.Typ={type:"select"};
if (scenario === "wrong_type") categoryProperties[section === "events" ? "Typ podujatia" : "Psipedia stav"] = { type: "select" };
const lostFoundExisting = { id:"existing", parent:{type:"data_source_id",data_source_id:ds},
  properties:{
    "Názov":{type:"title",title:[{plain_text:"Stratený labrador Nitra"}]},
    "Typ":{type:"rich_text",rich_text:[{plain_text:"LOST"}]},
    "Meno psa":{type:"rich_text",rich_text:[{plain_text:scenario === "ambiguous" ? "" : "Neo"}]},
    "Mesto":{type:"rich_text",rich_text:[{plain_text:"Nitra"}]},
    "Plemeno":{type:"rich_text",rich_text:[{plain_text:scenario === "ambiguous" ? "" : "Labrador"}]},
    "Farba":{type:"rich_text",rich_text:[{plain_text:scenario === "ambiguous" ? "" : "čierny"}]},
    "Rozlišovacie znaky":{type:"rich_text",rich_text:[{plain_text:scenario === "ambiguous" ? "" : "biela škvrna na hrudi"}]},
    "Dátum udalosti":{type:"date",date:{start:localToday}},
    "Zdroj URL":{type:"url",url:"https://example.com/about"}
  }};
const row = { id: "existing", properties: {
  ...(adoption ? {
    "Meno": {type:"title",title:[{plain_text:"Nový psík"}]},
    "Organizácia": {type:"rich_text",rich_text:[{plain_text:"Útulok Test"}]},
    "Zdroj dát": {type:"url",url:"https://example.com/about"},
  } : {"Názov": { type: "title", title: [{ plain_text: "Mock candidate" }] }}),
  ...(scenario === "duplicate" ? {
    "Začiatok": { type: "date", date: { start: "2099-10-20" } },
    "Mesto": { type: "rich_text", rich_text: [{ plain_text: "Sereď" }] },
  } : {}),
} };
globalThis.fetch = async (url, options = {}) => {
  const address = String(url);
  if (address === "https://generativelanguage.googleapis.com/v1beta/interactions") {
    geminiCalls++;
    const body = JSON.parse(options.body);
    if (body.model !== "gemini-3.8-flash") throw Error("WRONG_MODEL");
    if (scenario === "gemini_timeout") throw new DOMException("Mock timeout", "TimeoutError");
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
          { type: "google_search_call", id: "search-1", arguments: { queries: ["mock query"] } },
          { type: "google_search_result", call_id: "search-1", result: [{ search_suggestions: "Mock suggestions" }] },
          { type: "model_output", content: [{ type: "text", text: "Mock public source https://example.com/about",
            annotations: scenario === "missing_grounding" ? [] : [{ type: "url_citation", url: "https://example.com/about", start_index: 0, end_index: 18 }] }] },
        ],
      });
    }
    if (body.tools?.some(tool => tool.type !== "function"))
      throw Error("MIXED_TOOL_REQUEST");
    if (body.previous_interaction_id !== (geminiCalls === 2 ? "research-1" : "functions-" + (geminiCalls - 2)))
      throw Error("WRONG_PREVIOUS_INTERACTION");
    if (scenario.startsWith("pilot_")) {
      const candidate = { name: "Test Veterinár", city: "Sereď", source_url: "https://example.com/about",
        website_url: "https://example.com", phone: "+421 905 123 456", email: "clinic@example.com" };
      const action = (name, args) => json({ id: "functions-" + (geminiCalls - 1),
        status: "requires_action", steps: [step(name, "call-" + geminiCalls, args)] });
      const done = (text = "Done") => json({ id: "functions-" + (geminiCalls - 1), status: "completed",
        steps: [{ type: "model_output", content: [{ type: "text", text }] }] });
      if (body.tools.length === 0) {
        if (scenario === "pilot_ignores_stop") return action("search_notion", { query: "Test Veterinár" });
        if (scenario === "pilot_malformed_stop") return done("Done");
        return done(scenario === "pilot_unresolved_stop" ? '{"outcome":"unresolved"}' : '{"outcome":"exhausted"}');
      }
      if (scenario === "pilot_limit_write" && geminiCalls === 9) return action("create_notion_draft", candidate);
      if (["pilot_limit", "pilot_limit_write"].includes(scenario)) return action("search_notion", { query: "different-" + geminiCalls });
      if (geminiCalls === 2) return action("search_notion", { query: "Test Veterinár" });
      if (scenario === "pilot_empty") return done();
      if (["pilot_search_loop", "pilot_ignores_stop", "pilot_unresolved_stop", "pilot_malformed_stop"].includes(scenario))
        return action("search_notion", { query: "  test veterinar  " });
      if (geminiCalls === 3) return action("create_notion_draft", candidate);
      if (scenario === "pilot_duplicate_done") return done();
      if (scenario === "pilot_duplicate_new" || scenario === "pilot_duplicate_recover" && geminiCalls === 5) return action("create_notion_draft", {
        ...candidate, name: "Another clinic", city: "Nitra", source_url: "https://other.example/about",
        website_url: "https://other.example", phone: "+421 905 999 999", email: "other@example.com",
      });
      return action("create_notion_draft", { ...candidate, name: "TEST VETERINÁR", description: "Changed prose" });
    }
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
        step("create_notion_draft", "call-b", section !== "directory" ? categoryArgs : {
          name: "Test Veterinár", city: "Sereď", source_url: "https://example.com/about",
          website_url: "https://example.com", phone: "+421 905 123 456",
          email: "clinic@example.com", description: "Mock service",
        }),
      ] });
    }
    if (geminiCalls === 4 && scenario === "repeat_create")
      return json({ id: "functions-3", status: "requires_action", steps: [step("create_notion_draft", "call-c", section === "directory" ? {
        name: "Test Veterinár", city: "Sereď", source_url: "https://example.com/about",
        website_url: "https://example.com", phone: "+421 905 123 456", email: "clinic@example.com",
      } : categoryArgs)] });
    if (geminiCalls === 5 && scenario === "repeat_create")
      return json({ id: "functions-4", status: "completed", steps: [] });
    if (geminiCalls === 4)
      return json({ id: "functions-3", status: "completed", steps: [
        { type: "model_output", content: [{ type: "text", text: "Done" }] },
      ] });
    throw Error("EXTRA_GEMINI_REQUEST");
  }
  if (address.startsWith("https://api.notion.com/v1/")) {
    if (address === "https://api.notion.com/v1/data_sources/" + ds) {
      const schema = lostFound ? lostFoundProperties : adoption ? adoptionProperties : shelter ? shelterProperties : section === "directory" ? properties : categoryProperties;
      return json({ id: ds,
        ...(lostFound ? { parent:{type:"database_id",database_id:scenario==="wrong_database"
          ? "b7c978b6-bbfd-460b-b489-30e0814b0ddd" : canonicalDb} } : {}),
        properties: scenario === "wrong_database" && !lostFound ? { Name: { type: "title" } }
        : scenario === "unsafe_status_default" ? { ...schema, "Stav": { type: "select", select: { options: [{ name: "Publikované" }] } } } : schema });
    }
    if (address === "https://api.notion.com/v1/data_sources/" + ds + "/query") {
      scans++;
      if (scenario.startsWith("pilot_duplicate")) return json({ results: [{ id: "existing-clinic", properties: {
        "Názov": { type: "title", title: [{ plain_text: "Test Veterinár" }] },
        "Mesto": { type: "rich_text", rich_text: [{ plain_text: "Sereď" }] },
        "Web": { type: "url", url: "https://example.com" },
      } }], has_more: false });
      if (scenario === "paginated" && scans % 2 === 1) return json({ results: [], has_more: true, next_cursor: "page-2" });
      if (scenario === "partial_property") {
        const targetRow = lostFound ? lostFoundExisting : row;
        return json({ results: [{ ...targetRow, properties: { ...targetRow.properties,
          "Popis": { type: "rich_text", rich_text: [], has_more: true } } }], has_more: false });
      }
      if (scenario === "incomplete_scan" && scans > 1) return json({ results: [], has_more: true, next_cursor: null });
      if (scenario === "malformed_scan") return json({ has_more: false });
      return json({ results: scans > 1 && ["duplicate", "ambiguous", "shelter_other_type"].includes(scenario)
        ? [lostFound ? lostFoundExisting : shelter ? { ...row, properties: { ...row.properties,
          "Typ": { type:"rich_text", rich_text:[{plain_text:"CIVIC_ASSOCIATION"}] } } } : row]
        : [], has_more: false });
    }
    if (address === "https://api.notion.com/v1/pages") {
      notionPosts++;
      const body = JSON.parse(options.body);
      console.log("MOCK_PAGE " + JSON.stringify(body));
      if (body.parent?.data_source_id !== ds) throw Error("WRONG_TARGET");
      if (section === "directory" && (body.properties?.["Psipedia stav"]?.select?.name !== "Koncept" ||
          body.properties?.["Stav"]?.select?.name !== "Na kontrolu")) throw Error("NOT_DRAFT_ONLY");
      if (section === "events" && body.properties?.Stav?.select?.name !== "Nápad") throw Error("NOT_DRAFT_ONLY");
      if (section === "help" && !shelter && !adoption && !lostFound && (body.properties?.["Psipedia stav"]?.rich_text?.[0]?.text?.content !== "draft" || body.properties.Slug))
        throw Error("NOT_DRAFT_ONLY");
      if (lostFound && (body.properties?.["Psipedia stav"]?.rich_text?.[0]?.text?.content !== "DRAFT" ||
        !["LOST","FOUND"].includes(body.properties?.Typ?.rich_text?.[0]?.text?.content) ||
        body.properties?.Slug || body.properties?.["Psipedia ID"] || body.properties?.Latitude ||
        body.properties?.Longitude || body.properties?.["Verejný kontakt"] || body.properties?.Publikované))
        throw Error("LOST_FOUND_NOT_DRAFT");
      if (adoption && (body.properties?.Stav?.select?.name !== "Nápad" ||
         body.properties?.Meno?.title?.[0]?.text?.content !== "Nový psík" ||
         body.properties?.Slug || body.properties?.["Psipedia ID"] || body.properties?.Latitude))
         throw Error("ADOPTION_NOT_DRAFT");
       if (shelter && (body.parent?.data_source_id !== ds || body.properties?.Typ?.rich_text?.[0]?.text?.content !== "SHELTER" || body.properties?.Stav?.select?.name !== "Nápad" || body.properties?.Adresa || body.properties?.Latitude || body.properties?.Longitude)) throw Error("SHELTER_DRAFT_INVALID");
      if (scenario === "notion_uncertain") throw Error("SIMULATED_POST_TIMEOUT");
      if (scenario === "notion_500") return json({}, 500);
      if (scenario === "notion_invalid_json") return new Response("invalid");
      if (scenario === "notion_missing_id") return json({});
      return json({ id: "mock-notion-page", properties: body.properties });
    }
    throw Error("UNEXPECTED_NOTION_ENDPOINT");
  }
  if (address === "https://psipedia.sk/api/internal/gemini-agent/callback") {
    callbacks++;
    const expected = "sha256=" + createHmac("sha256", process.env.PSIPEDIA_AGENT_CALLBACK_SECRET)
      .update(options.body).digest("hex");
    if (scenario === "callback_bad_signature" || options.headers["X-Psipedia-Signature"] !== expected)
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
