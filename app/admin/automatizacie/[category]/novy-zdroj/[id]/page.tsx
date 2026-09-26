import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { AdminAutomationCandidateReview } from "@/components/admin-automation-candidate-review";
import { requireAdminPageUser } from "@/lib/admin-auth";
import {
  findRelevantAutomationSourceForCandidate,
  getAutomationSourceCandidate,
} from "@/lib/data-automation-source-store";
import {
  automationCategoryBySlug,
  automationCategoryForCandidate,
} from "@/lib/admin-automation-presentation";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ category: string; id: string }> };

export default async function AutomationCandidateReviewPage({ params }: Props) {
  const { category: slug, id: rawId } = await params;
  const category = automationCategoryBySlug(slug);
  if (!category) notFound();

  const user = await requireAdminPageUser("/admin/automatizacie/" + slug + "/novy-zdroj/" + rawId);
  const id = Number.parseInt(rawId, 10);
  if (!Number.isSafeInteger(id) || id < 1) notFound();

  const candidate = await getAutomationSourceCandidate(id).catch(() => null);
  if (!candidate || automationCategoryForCandidate(candidate) !== slug) notFound();
  const existingSource = await findRelevantAutomationSourceForCandidate(candidate).catch(() => null);

  return (
    <AdminShell
      user={user}
      eyebrow={"Automatizácie · " + category.title}
      title={candidate.label || "Nový zdroj"}
      description="Skontroluj návrh zdroja a rozhodni, či ho zaradiť medzi zdroje Psipedie."
      actions={<Link href={"/admin/automatizacie/" + slug + "#nove-zdroje"}>← Späť na nové zdroje</Link>}
    >
      <AdminAutomationCandidateReview candidate={candidate} categorySlug={slug} existingSource={existingSource} />
    </AdminShell>
  );
}
