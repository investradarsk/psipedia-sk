import { requireAdminMutation } from "@/lib/admin-auth";
import { requireGeminiAdminD1 } from "@/lib/gemini-automation-admin-db";
import { getLinkedGeminiConcept } from "@/lib/gemini-automation-concept-review";
import { getGeminiCatalogItem } from "@/lib/gemini-automation-catalog";
import { prepareGeminiCanonicalRejection, persistGeminiRejectionPlan } from "@/lib/gemini-automation-dedupe-store";
import { rememberGeminiEventRejection } from "@/lib/gemini-automation-event-dedupe";
import { archiveManagedDirectoryProfile, getManagedDirectoryProfileById } from "@/lib/directory-store";

export const dynamic = "force-dynamic";
const NO_STORE = { "cache-control": "no-store" };
type Props = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Props) {
  const auth = await requireAdminMutation(request);
  if (auth.response) return auth.response;
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return Response.json({ error: "Vyžaduje sa application/json." }, { status: 415, headers: NO_STORE });
  }
  const value = (await params).id;
  if (!/^[1-9][0-9]{0,14}$/.test(value)) {
    return Response.json({ error: "Neplatné ID konceptu." }, { status: 400, headers: NO_STORE });
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id)) {
    return Response.json({ error: "Neplatné ID konceptu." }, { status: 400, headers: NO_STORE });
  }
  try {
    const database = requireGeminiAdminD1() as D1Database;
    const concept = await getLinkedGeminiConcept(database, id);
    if (!concept) return Response.json({ error: "Koncept sa nenašiel." }, { status: 404, headers: NO_STORE });
    if (concept.canonical_entity_type === "EVENT") {
      if (concept.status !== "NOTION_LINKED" || !concept.canonical_entity_id ||
        getGeminiCatalogItem(concept.stable_key)?.section !== "events") {
        return Response.json({error:"Tento Event koncept nie je možné odmietnuť."},{status:409,headers:NO_STORE});
      }
      const event = await database.prepare(
        "SELECT id,title,organizer,start_date,end_date,city,venue,website_url AS event_url,registration_url,status "+
        "FROM managed_events WHERE id=? LIMIT 1"
      ).bind(concept.canonical_entity_id).first<{
        id:number;title:string;organizer:string;start_date:string;end_date:string|null;
        city:string;venue:string;event_url:string|null;registration_url:string|null;status:string;
      }>();
      if (!event) return Response.json({error:"Podujatie neexistuje."},{status:404,headers:NO_STORE});
      if (event.status !== "draft") {
        return Response.json({error:"Publikované podujatie nemožno odmietnuť cez Gemini."},{status:409,headers:NO_STORE});
      }
      // An Event rejection is NOT a cancellation or deletion. Keep canonical draft and Notion mapping.
      const fingerprints = await rememberGeminiEventRejection(
        database,concept.stable_key,event,event.id,concept.id,
      );
      return Response.json({rejected:true,archived:false,draftRetained:true,fingerprints},{headers:NO_STORE});
    }
    if (concept.canonical_entity_type !== "DIRECTORY" ||
      concept.status !== "NOTION_LINKED" ||
      !concept.canonical_entity_id || !Number.isSafeInteger(concept.canonical_entity_id) ||
      getGeminiCatalogItem(concept.stable_key)?.section !== "directory") {
      return Response.json({ error: "Tento koncept nie je možné odmietnuť." }, { status: 409, headers: NO_STORE });
    }
    const profile = await getManagedDirectoryProfileById(concept.canonical_entity_id, database);
    if (!profile) return Response.json({ error: "Canonical profil sa nenašiel." }, { status: 404, headers: NO_STORE });
    if (profile.status !== "draft" && profile.status !== "archived") {
      return Response.json({ error: "Publikovaný profil nemožno odmietnuť cez Gemini." }, { status: 409, headers: NO_STORE });
    }
    // Validate and hash immutable identity before archive. A failed identity
    // precondition must not leave an archived draft without rejection memory.
    const rejection = await prepareGeminiCanonicalRejection({
      stableKey: concept.stable_key,
      profile,
      reasonCode: "ADMIN_REJECTED",
    });
    if (profile.status === "draft") {
      // Conditional canonical transition prevents a concurrent editor publish
      // from being archived by this Gemini-only endpoint.
      const archived = await archiveManagedDirectoryProfile(
        profile.id, auth.user!.email, new Date(), database, { draftOnly: true },
      );
      if (!archived || archived.status !== "archived") {
        return Response.json({ error: "Profil už nie je koncept." }, { status: 409, headers: NO_STORE });
      }
    }
    // If the request failed after canonical archive, an archived retry safely
    // finishes these UPSERTs without duplicate rows or additional profiles.
    const fingerprints = await persistGeminiRejectionPlan(database, rejection);
    return Response.json({ rejected: true, archived: true, fingerprints }, { headers: NO_STORE });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "GEMINI_DEDUPE_NO_REJECTION_IDENTITY") {
      return Response.json({ error: "Profil nemá dostatočnú identitu na bezpečné odmietnutie." },
        { status: 409, headers: NO_STORE });
    }
    if (message === "GEMINI_DIRECTORY_DRAFT_ONLY") {
      return Response.json({ error: "Profil bol medzičasom publikovaný alebo zmenený." },
        { status: 409, headers: NO_STORE });
    }
    return Response.json({ error: "Odmietnutie sa nepodarilo dokončiť. Skontroluj stav konceptu pred opakovaním." },
      { status: 503, headers: NO_STORE });
  }
}
