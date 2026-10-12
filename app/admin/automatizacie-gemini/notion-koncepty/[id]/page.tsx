import Link from "next/link";
import { notFound } from "next/navigation";
import { env } from "cloudflare:workers";
import { AdminShell } from "@/components/admin-shell";
import { AdminDirectoryEditor } from "@/components/admin-directory-editor";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getGeminiDirectoryDraft, GeminiNotionReviewError } from "@/lib/gemini-notion-directory-review";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export default async function GeminiNotionConceptPage({ params }: Props) {
  const { id } = await params;
  const user = await requireAdminPageUser("/admin/automatizacie-gemini/notion-koncepty/" + id);
  let draft;
  try {
    draft = await getGeminiDirectoryDraft(env, id);
  } catch (error) {
    if (error instanceof GeminiNotionReviewError && ["ID", "NOT_FOUND"].includes(error.code)) notFound();
    throw error;
  }
  return <AdminShell
    user={user}
    eyebrow="Koncept Gemini · Notion"
    title={"Upraviť profil · " + draft.name}
    description="Rovnaký editor ako v Adresári. Uloženie aktualizuje iba tento koncept v Notione a samo nič nepublikuje."
    actions={<Link href="/admin/automatizacie-gemini">← Späť na koncepty Gemini</Link>}
  >
    <AdminDirectoryEditor notionDraft={draft} />
  </AdminShell>;
}
