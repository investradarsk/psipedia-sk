import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { AdminGeminiConceptReview } from "@/components/admin-gemini-concept-review";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { requireGeminiAdminD1 } from "@/lib/gemini-automation-admin-db";
import { listPendingGeminiDirectoryConcepts } from "@/lib/gemini-automation-concept-review";

export const dynamic = "force-dynamic";

export default async function GeminiConceptReviewPage() {
  const user = await requireAdminPageUser("/admin/automatizacie-gemini/koncepty");
  let concepts: Awaited<ReturnType<typeof listPendingGeminiDirectoryConcepts>> = [];
  let error = false;
  try {
    concepts = await listPendingGeminiDirectoryConcepts(requireGeminiAdminD1());
  } catch {
    error = true;
  }
  return (
    <AdminShell user={user} eyebrow="Automatizácie Gemini" title="Koncepty Gemini"
      description="Kontrola nepublikovaných profilov z Gemini. Úpravy a publikovanie sa vykonávajú iba cez existujúci adresár."
      actions={<Link className="admin-secondary-action" href="/admin/automatizacie-gemini">← Automatizácie Gemini</Link>}>
      {error
        ? <p role="alert" className="admin-flash admin-flash--error">Koncepty sa nepodarilo načítať. Skontroluj databázové pripojenie.</p>
        : <AdminGeminiConceptReview concepts={concepts} />}
    </AdminShell>
  );
}
