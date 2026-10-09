import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { AdminGeminiEventConceptReview } from "@/components/admin-gemini-event-concept-review";
import { AdminGeminiConceptReview } from "@/components/admin-gemini-concept-review";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { requireGeminiAdminD1 } from "@/lib/gemini-automation-admin-db";
import { listPendingGeminiDirectoryConcepts, listPendingGeminiEventConcepts } from "@/lib/gemini-automation-concept-review";

export const dynamic = "force-dynamic";

export default async function GeminiConceptReviewPage() {
  const user = await requireAdminPageUser("/admin/automatizacie-gemini/koncepty");
  let concepts: Awaited<ReturnType<typeof listPendingGeminiDirectoryConcepts>> = [];
  let events: Awaited<ReturnType<typeof listPendingGeminiEventConcepts>> = [];
  let error = false;
  try {
    const database=requireGeminiAdminD1();
    [concepts,events] = await Promise.all([
      listPendingGeminiDirectoryConcepts(database),listPendingGeminiEventConcepts(database),
    ]);
  } catch {
    error = true;
  }
  return (
    <AdminShell user={user} eyebrow="Automatizácie Gemini" title="Koncepty Gemini"
      description="Kontrola návrhov služieb a podujatí. Publikovať možno iba v existujúcich kanonických editoroch."
      actions={<Link className="admin-secondary-action" href="/admin/automatizacie-gemini">← Automatizácie Gemini</Link>}>
      {error
        ? <p role="alert" className="admin-flash admin-flash--error">Koncepty sa nepodarilo načítať. Skontroluj databázové pripojenie.</p>
        : <>
            <h2>Služby pre psov</h2>
            <AdminGeminiConceptReview concepts={concepts} />
            <h2>Podujatia</h2>
            <AdminGeminiEventConceptReview concepts={events} />
          </>}
    </AdminShell>
  );
}
