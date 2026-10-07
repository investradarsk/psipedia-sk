import Link from "next/link";
import { AdminEditorialCalendar } from "@/components/admin-editorial-calendar";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listEditorialCalendarItems, parseEditorialCalendarMonth } from "@/lib/editorial-calendar";

export const dynamic = "force-dynamic";

type SearchParams = { mesiac?: string | string[] };

export default async function AdminArticleCalendarPage({
  searchParams,
}: { searchParams: Promise<SearchParams> }) {
  const user = await requireAdminPageUser("/admin/clanky/kalendar");
  const params = await searchParams;
  const { year, month } = parseEditorialCalendarMonth(
    typeof params.mesiac === "string" ? params.mesiac : undefined,
  );
  const articles = await listEditorialCalendarItems(year, month);
  return (
    <AdminShell
      user={user}
      eyebrow="Obsah"
      title="Redakčný kalendár"
      description="Publikované a naplánované články podľa dátumu a času publikovania."
      actions={<>
        <Link className="admin-secondary-action" href="/admin/clanky">Zoznam článkov</Link>
        <Link className="admin-primary-action" href="/admin/novy">+ Nový obsah</Link>
      </>}
    >
      <AdminEditorialCalendar key={`${year}-${month}`} year={year} month={month} items={articles} />
    </AdminShell>
  );
}
