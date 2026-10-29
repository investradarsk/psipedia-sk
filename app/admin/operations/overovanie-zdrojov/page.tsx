import { env } from "cloudflare:workers";
import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { AdminHelpSourceReview } from "@/components/admin-help-source-review";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { helpSourceSchemaReady, listHelpSourceChecks } from "@/lib/help-source-daily-check";

export const dynamic = "force-dynamic";

export default async function AdminHelpSourceChecksPage() {
  const user = await requireAdminPageUser("/admin/operations/overovanie-zdrojov");
  const database = (env as unknown as { DB?: D1Database }).DB;
  const ready = Boolean(database && await helpSourceSchemaReady(database));
  const items = ready && database ? await listHelpSourceChecks(database) : [];

  return (
    <AdminShell user={user} eyebrow="Pomoc psom" title="Overovanie zdrojov"
      description="Denné kontroly aktuálnosti adopcií a stratených či nájdených psov.">
      <div className="admin-panel">
        <p><Link href="/admin/operations">← Späť na upozornenia</Link></p>
        {!ready
          ? <p role="status">Kontroly sa sprístupnia po nasadení databázovej migrácie 0146.</p>
          : <AdminHelpSourceReview items={items} />}
      </div>
    </AdminShell>
  );
}
