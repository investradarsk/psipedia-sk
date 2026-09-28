import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAutomationCategorySources } from "@/components/admin-automation-category-sources";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import {
  automationCategoryBySlug,
  automationCandidatesForCategory,
  automationDiscoveryRootsForCategory,
  automationSourcesForCategory,
} from "@/lib/admin-automation-presentation";
import { listAutomationDiscoveryRoots } from "@/lib/data-automation-discovery-store";
import { listAutomationSourceCandidates, listAutomationSourcesAdmin } from "@/lib/data-automation-source-store";
import { isTavilySearchDiscoveryRoot } from "@/lib/tavily-canary-control";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ category: string }> };

export default async function AutomationCategoryPage({ params }: Props) {
  const slug = (await params).category;
  const category = automationCategoryBySlug(slug);
  if (!category) notFound();
  const user = await requireAdminPageUser("/admin/automatizacie/" + slug);

  const [allSources, allCandidates, allRoots] = await Promise.all([
    listAutomationSourcesAdmin(undefined, 200).catch(() => []),
    listAutomationSourceCandidates(undefined, 200).catch(() => []),
    listAutomationDiscoveryRoots(undefined, 100).catch(() => []),
  ]);

  return (
    <AdminShell
      user={user}
      eyebrow="Automatizácie"
      title={category.title}
      description="Správa zdrojov pre túto kategóriu. Obsah sa spracúva ako koncept v príslušnej admin sekcii."
      actions={<Link href="/admin/automatizacie">← Všetky kategórie</Link>}
    >
      <AdminAutomationCategorySources
        category={category}
        sources={automationSourcesForCategory(allSources, slug)}
        candidates={automationCandidatesForCategory(allCandidates, slug)}
        discoveryRoots={automationDiscoveryRootsForCategory(allRoots, slug).filter(isTavilySearchDiscoveryRoot)}
      />
    </AdminShell>
  );
}
