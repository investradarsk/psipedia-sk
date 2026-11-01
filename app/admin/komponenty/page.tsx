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
      description="Pozri si skutočný vzhľad bannerov a presné URL ich overeného použitia. Ďalšie prvky budeme pridávať postupne."
    >
      <AdminVisualLibrary articleUsage={articleUsage} examples={examples} />
      <details style={{marginTop: 20, border: "1px solid #dce8df", borderRadius: 12, padding: 16, background: "#fff"}}>
        <summary style={{cursor:"pointer", fontWeight:700}}>Technický register (pre programátora)</summary>
        <p style={{fontSize:".83rem", color:"#617266"}}>Podrobná mapa súborov a importov zostáva zachovaná. Pre bežné používanie stačí vizuálna knižnica vyššie.</p>
        <AdminComponentRegistry registry={registry as unknown as Parameters<typeof AdminComponentRegistry>[0]["registry"]} />
      </details>
    </AdminShell>
  );
}
