import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { AdminGeminiCategoryPromptEditor } from "@/components/admin-gemini-category-prompt-editor";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { geminiAutomationCatalog, getGeminiCatalogItem } from "@/lib/gemini-automation-catalog";
import { geminiCategoryPromptViews } from "@/lib/gemini-automation-category-prompts";
import { requireGeminiAdminD1 } from "@/lib/gemini-automation-admin-db";
import { listGeminiCategoryPrompts } from "@/lib/gemini-automation-category-prompt-store";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ stable_key?: string | string[] }> };

export default async function GeminiCategoryPromptsPage({ searchParams }: Props) {
  const user = await requireAdminPageUser("/admin/automatizacie-gemini/prompty");
  const query = (await searchParams).stable_key;
  const requestedKey = Array.isArray(query) ? query[0] : query;
  if (requestedKey !== undefined && !getGeminiCatalogItem(requestedKey)) notFound();
  const selectedKey = requestedKey ?? geminiAutomationCatalog[0].stableKey;

  let prompts = geminiCategoryPromptViews([]);
  let available = true;
  try {
    prompts = await listGeminiCategoryPrompts(requireGeminiAdminD1());
  } catch {
    // Defaults are still useful before migration; saving stays unavailable.
    available = false;
  }

  return (
    <AdminShell
      user={user}
      eyebrow="Automatizácie Gemini"
      title="Prompty pre 22 kategórií"
      description="Každá kategória má vlastné zadanie. Uloženie nemení plánovanie ani nespúšťa Gemini."
      actions={<Link className="admin-secondary-action" href="/admin/automatizacie-gemini">← Automatizácie Gemini</Link>}
    >
      {!available && (
        <p role="alert" className="admin-flash admin-flash--error">
          D1 úložisko promptov nie je dostupné. Pred úpravami aplikuj migráciu 0125.
          Predvolené prompty si stále môžeš prezrieť.
        </p>
      )}
      <AdminGeminiCategoryPromptEditor
        initialPrompts={prompts}
        selectedKey={selectedKey}
        available={available}
      />
    </AdminShell>
  );
}
