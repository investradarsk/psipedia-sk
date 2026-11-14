import { AdminShell } from "@/components/admin-shell";
import { AdminComponentRegistry } from "@/components/admin-component-registry";
import { AdminVisualLibrary } from "@/components/admin-visual-library";
import { requireAdminPageUser } from "@/lib/admin-auth";
import registry from "@/lib/generated/component-registry.json";
import { loadPublishedArticleBannerUses } from "@/lib/visual-library-usage-store";
import { getVisualLibraryExamples } from "@/components/admin-visual-library-examples.server";

export const dynamic = "force-dynamic";

export default async function AdminComponentsPage() {
  const user = await requireAdminPageUser("/admin/komponenty");
  const [articleUsage, examples] = await Promise.all([
    loadPublishedArticleBannerUses(),
    getVisualLibraryExamples(),
  ]);
  return (
    <AdminShell
      user={user}
      eyebrow="Vizuál webu"
      title="Vizuálna knižnica"
      description="Prehliadaj skutočné grafické náhľady, varianty spoločných komponentov a doložené miesta ich použitia. Technický register je voliteľný."
    >
      <div data-admin-content-module="visual-library">
      <AdminVisualLibrary articleUsage={articleUsage} examples={examples} registry={registry as unknown as Parameters<typeof AdminVisualLibrary>[0]["registry"]} />
      <details className="admin-components-technical-register">
        <summary>Technický register (pre programátora)</summary>
        <p>Podrobná mapa súborov a importov zostáva zachovaná. Pre bežné používanie stačí vizuálna knižnica vyššie.</p>
        <AdminComponentRegistry registry={registry as unknown as Parameters<typeof AdminComponentRegistry>[0]["registry"]} />
      </details>
      </div>
    </AdminShell>
  );
}
