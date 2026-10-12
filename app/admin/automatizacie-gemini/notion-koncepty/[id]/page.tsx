import Link from "next/link";
import { notFound } from "next/navigation";
import { env } from "cloudflare:workers";
import { AdminShell } from "@/components/admin-shell";
import { AdminGeminiNotionPublish } from "@/components/admin-gemini-notion-publish";
import { requireAdminPageUser } from "@/lib/admin-auth";
import {
  getGeminiDirectoryDraft, GeminiNotionReviewError,
} from "@/lib/gemini-notion-directory-review";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

function officialLink(href: string, title: string) {
  if (!/^https:\/\//i.test(href)) return null;
  return <a href={href} target="_blank" rel="noopener noreferrer">{title} ↗</a>;
}

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
  const approved = draft.editorialState === "Publikované" || draft.psipediaStatus === "Publikované";
  return <AdminShell
    user={user}
    eyebrow="Koncept Gemini · Notion"
    title={draft.name}
    description="Náhľad originálneho Notion konceptu pred schválením na Psipedii. Zatiaľ nie je verejne publikovaný."
    actions={<>
      <Link href="/admin/automatizacie-gemini">← Automatizácie Gemini</Link>
      {officialLink(draft.notionUrl, "Upraviť koncept v Notione")}
    </>}
  >
    <section className="admin-form-card">
      <h2>Profil na kontrolu</h2>
      <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
        {([
          ["Kategória", draft.category], ["Mesto", draft.city], ["Adresa", draft.address],
          ["Kraj", draft.region], ["Telefón", draft.phone], ["E-mail", draft.email],
          ["Redakčný stav", approved ? "Čaká na synchronizáciu" : "Koncept"],
        ] as const).map(([label, value]) => <div key={label}>
          <dt style={{ fontWeight: 600 }}>{label}</dt><dd style={{ margin: 0 }}>{value || "—"}</dd>
        </div>)}
      </dl>
      <p><strong>Web:</strong> {officialLink(draft.website, draft.website) ?? "—"}</p>
      <p><strong>Zdroj:</strong> {officialLink(draft.source, draft.source) ?? "—"}</p>
      <p><strong>Logo:</strong> {officialLink(draft.logoUrl, "Oficiálne logo") ?? "—"}</p>
      <p><strong>Hlavný obrázok:</strong> {officialLink(draft.imageUrl, "Zobraziť obrázok") ?? "—"}</p>
      <h3>Krátky opis</h3>
      <p style={{ whiteSpace: "pre-wrap" }}>{draft.summary || "—"}</p>
      <h3>Podrobný opis</h3>
      <p style={{ whiteSpace: "pre-wrap" }}>{draft.description || "—"}</p>
      <h3>Služby</h3>
      <p style={{ whiteSpace: "pre-wrap" }}>{draft.services || "—"}</p>
    </section>
    <AdminGeminiNotionPublish id={draft.id} alreadyApproved={approved} />
  </AdminShell>;
}
