import Link from "next/link";
import { AdminEditorialCalendar } from "@/components/admin-editorial-calendar";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listEditorialCalendarItems, parseEditorialCalendarMonth } from "@/lib/editorial-calendar";

export const dynamic = "force-dynamic";

type SearchParams = { mesiac?: string | string[]; den?: string | string[]; koncept?: string | string[]; cas?: string | string[] };

export default async function AdminArticleCalendarPage({
  searchParams,
}: { searchParams: Promise<SearchParams> }) {
  const user = await requireAdminPageUser("/admin/clanky/kalendar");
  const params = await searchParams;
  const { year, month } = parseEditorialCalendarMonth(
    typeof params.mesiac === "string" ? params.mesiac : undefined,
  );
  const articles = await listEditorialCalendarItems(year, month);
  const day = typeof params.den === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.den) && params.den.startsWith(`${year}-${String(month).padStart(2, "0")}-`) ? params.den : undefined;
  const id = typeof params.koncept === "string" ? Number(params.koncept) : NaN;
  const resumeDraftId = day && Number.isSafeInteger(id) && id > 0 ? id : undefined;
  const initialTime = typeof params.cas === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(params.cas) ? params.cas : "09:00";
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
      <AdminEditorialCalendar key={`${year}-${month}`} year={year} month={month} items={articles} initialDay={day} resumeDraftId={resumeDraftId} initialTime={initialTime} />
    </AdminShell>
  );
}
