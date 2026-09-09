import { AdminArticleEditor } from "@/components/admin-article-editor";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listManagedBreedSummaries } from "@/lib/breed-store";
import { isArticlePortalSection } from "@/lib/portal";
import { listManagedPortalSections } from "@/lib/section-store";

export const dynamic = "force-dynamic";

export default async function NewArticlePage({ searchParams }: { searchParams: Promise<{ sekcia?: string; oblast?: string }> }) {
  const user = await requireAdminPageUser("/admin/novy");
  const { sekcia, oblast } = await searchParams;
  const [breedOptions, managedSections] = await Promise.all([listManagedBreedSummaries(500), listManagedPortalSections()]);
  const requestedSection = sekcia && isArticlePortalSection(sekcia) && (sekcia === "clanky" || managedSections.some((section) => section.slug === sekcia && section.articleEnabled && section.visible !== false)) ? sekcia : "steniatka";

  return (
    <AdminShell
      user={user}
      eyebrow="Nový obsah"
      title="Napíš článok alebo aktuálnu novinku"
      description="Najprv vyber sekciu portálu. Kým obsah nepublikuješ, čitatelia ho neuvidia."
    >
      <AdminArticleEditor
        defaultPortalSection={requestedSection}
        defaultPortalSubpage={oblast}
        breedOptions={breedOptions}
        managedSections={managedSections}
      />
    </AdminShell>
  );
}
