import { AdminArticleEditor } from "@/components/admin-article-editor";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function NewArticlePage() {
  const user = await requireAdminPageUser("/admin/novy");

  return (
    <AdminShell
      user={user}
      eyebrow="Nový obsah"
      title="Napíš článok alebo aktuálnu novinku"
      description="Najprv vyber sekciu portálu. Kým obsah nepublikuješ, čitatelia ho neuvidia."
    >
      <AdminArticleEditor />
    </AdminShell>
  );
}
