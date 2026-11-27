import { env } from "cloudflare:workers";
import { AdminReviewCheckbox } from "@/components/admin-review-checkbox";
import { getAdminEntityReview } from "@/lib/admin-entity-review-store";
import { notFound } from "next/navigation";
import { AdminBreedEditor } from "@/components/admin-breed-editor";
import { AdminShell } from "@/components/admin-shell";
import { adminReturnHref } from "@/lib/admin-return-navigation";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getBreedEditorOptions, getManagedBreed } from "@/lib/breed-store";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string | string[] }> };

export default async function EditBreedPage({ params, searchParams }: Props) {
  const returnHref = adminReturnHref((await searchParams).returnTo, ["/admin/plemena", "/admin/kvalita/seo"]);
  const { id } = await params;
  const numeric = Number(id);
  if (!Number.isSafeInteger(numeric)) notFound();
  const user = await requireAdminPageUser(`/admin/plemena/${id}`);
  const breed = await getManagedBreed(numeric);
  if (!breed) notFound();
  const options = await getBreedEditorOptions(breed);
  const review=(env as unknown as {NOTION_PROFILE_AUTHORITY_MODE?:string}).NOTION_PROFILE_AUTHORITY_MODE==="validated-text"?await getAdminEntityReview("BREED",numeric):null;
  return (
    <AdminShell recordId={numeric} user={user} eyebrow={breed.status === "published" ? "Publikované plemeno" : "Koncept"}
      title={`Upraviť: ${breed.name}`} description="Zmeny sa na verejnom atlase ukážu po publikovaní.">
      {review&&<AdminReviewCheckbox entityType="BREED" entityId={numeric} initialReviewed={review.reviewed} initialReviewedAt={review.reviewedAt} showDate />}
      <AdminBreedEditor breed={breed} options={options} returnHref={returnHref} />
    </AdminShell>
  );
}
