import { AdminShell } from "@/components/admin-shell";
import { AdminShadcnEditorPreview } from "@/components/admin-shadcn-editor-preview";
import { requireAdminPageUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * Authenticated, read-only demonstration. Does not load canonical data or
 * expose mutation endpoints. Existing editors keep serving all real records.
 */
export default async function UnifiedEditorPreviewPage() {
  const user = await requireAdminPageUser("/admin/unified-editor-preview");
  return (
    <AdminShell
      user={user}
      eyebrow="Jednotné editory · krok 2/18"
      title="Open-source editor – ukážka"
      description="Vzorový dizajn podľa shadcn-admin. Formulár je iba lokálna simulácia; nič sa na Psipedii neuloží."
    >
      <AdminShadcnEditorPreview />
    </AdminShell>
  );
}
