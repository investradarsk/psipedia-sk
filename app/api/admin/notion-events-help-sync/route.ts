import { env } from "cloudflare:workers";
import { requireAdminMutation } from "@/lib/admin-auth";
import {
  runNotionEventsHelpSyncSweep,
  type NotionEventsHelpMode,
  type NotionEventsHelpSyncBindings,
} from "@/lib/notion-events-help-sync";
import type { BidirectionalAgendaKey } from "@/lib/notion-events-help-adapters";

export const dynamic = "force-dynamic";

type RuntimeBindings = NotionEventsHelpSyncBindings & { DB?: D1Database };

const MODES = new Set<NotionEventsHelpMode>(["dry-run", "bootstrap", "sync"]);
const AGENDAS = new Set<BidirectionalAgendaKey>([
  "events",
  "organizations",
  "adoptions",
  "help-cases",
  "lost-found",
]);

function parseAgendas(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !AGENDAS.has(item as BidirectionalAgendaKey))) {
    throw new Error("agendas obsahuje nepodporovanú agendu.");
  }
  return value as BidirectionalAgendaKey[];
}

export async function POST(request: Request) {
  const auth = await requireAdminMutation(request);
  if (auth.response) return auth.response;

  const bindings = env as unknown as RuntimeBindings;
  if (!bindings.DB) {
    return Response.json({ error: "Databáza nie je pripojená." }, { status: 503 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Neplatné JSON telo." }, { status: 400 });
  }

  const mode = payload.mode as NotionEventsHelpMode;
  if (!MODES.has(mode)) {
    return Response.json({ error: "mode musí byť dry-run, bootstrap alebo sync." }, { status: 400 });
  }

  if (mode === "bootstrap" && payload.confirm !== "NOTION_EVENTS_HELP_BOOTSTRAP") {
    return Response.json({
      error: "Bootstrap vyžaduje explicitné confirm=NOTION_EVENTS_HELP_BOOTSTRAP.",
    }, { status: 409 });
  }
  if (mode === "sync" && payload.confirm !== "NOTION_EVENTS_HELP_SYNC") {
    return Response.json({
      error: "Sync vyžaduje explicitné confirm=NOTION_EVENTS_HELP_SYNC.",
    }, { status: 409 });
  }

  let agendas: BidirectionalAgendaKey[] | undefined;
  try {
    agendas = parseAgendas(payload.agendas);
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Neplatné agendy.",
    }, { status: 400 });
  }

  try {
    const result = await runNotionEventsHelpSyncSweep({
      database: bindings.DB,
      bindings,
      mode,
      force: true,
      agendas,
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Notion bidirectional sync zlyhal.",
    }, { status: 500 });
  }
}
