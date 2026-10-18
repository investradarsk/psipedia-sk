import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { AdminGeminiAllConcepts } from "@/components/admin-gemini-all-concepts";
import { requireAdminPageUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * The global overview intentionally reuses the 22 existing per-category
 * Gemini draft endpoints. The old D1 pending-review queries show only a
 * subset of canonical draft statuses and omit the help section altogether.
 */
export default async function GeminiConceptReviewPage() {
  const user = await requireAdminPageUser("/admin/automatizacie-gemini/koncepty");
  return (
    <AdminShell
      user={user}
      eyebrow="Automatizácie Gemini"
      title="Všetky koncepty"
      description="Spoločný prehľad konceptov z existujúcich 22 kategórií Gemini. Služby, podujatia a pomoc psom."
      actions={<Link className="admin-secondary-action" href="/admin/automatizacie-gemini">← Automatizácie Gemini</Link>}
    >
      <AdminGeminiAllConcepts />
    </AdminShell>
  );
}
