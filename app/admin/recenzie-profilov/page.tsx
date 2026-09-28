import Link from "next/link";
import { AdminPagination } from "@/components/admin-pagination";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import {
  listProfileReviewsAdmin,
  profileReviewAdminEntityTypes,
} from "@/lib/profile-review-admin";
import { profileReviewStatuses } from "@/lib/profile-review-domain";
import "./reviews.css";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("sk-SK", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Bratislava",
      }).format(date);
}

function excerpt(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > 180 ? `${clean.slice(0, 177)}…` : clean;
}

export default async function AdminProfileReviewsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireAdminPageUser("/admin/recenzie-profilov");
  const raw = await searchParams;
  const status = first(raw.status) || "PENDING_REVIEW";
  const entityType = first(raw.type) || "all";
  const rating = first(raw.rating);
  const q = first(raw.q);
  const page = first(raw.page);

  const data = await listProfileReviewsAdmin({
    status,
    entityType,
    rating,
    q,
    page,
  });

  const baseQuery = new URLSearchParams();
  if (data.filters.status !== "PENDING_REVIEW") baseQuery.set("status", data.filters.status);
  if (data.filters.entityType !== "all") baseQuery.set("type", data.filters.entityType);
  if (data.filters.rating !== null) baseQuery.set("rating", String(data.filters.rating));
  if (data.filters.q) baseQuery.set("q", data.filters.q);
  const basePath = baseQuery.size ? `/admin/recenzie-profilov?${baseQuery.toString()}` : "/admin/recenzie-profilov";

  return (
    <AdminShell
      user={user}
      eyebrow="Profilové recenzie"
      title="Moderácia profilových recenzií"
      description="Kontrola recenzií služieb a organizácií. Moderácia mení iba lifecycle a viditeľnosť; text ani rating používateľa sa neupravujú."
    >
      <section className="admin-review-card">
        <form className="admin-review-filters" method="get" aria-label="Filtrovať profilové recenzie">
          <label>
            Stav
            <select name="status" defaultValue={data.filters.status}>
              <option value="all">Všetky stavy</option>
              {profileReviewStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Typ profilu
            <select name="type" defaultValue={data.filters.entityType}>
              <option value="all">Všetky typy</option>
              {profileReviewAdminEntityTypes.map((item) => (
                <option key={item} value={item}>
                  {item === "DIRECTORY_PROFILE" ? "Adresár" : "Organizácia"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Hodnotenie
            <select name="rating" defaultValue={data.filters.rating ?? ""}>
              <option value="">Všetky</option>
              {[5, 4, 3, 2, 1].map((item) => <option key={item} value={item}>{item} / 5</option>)}
            </select>
          </label>
          <label className="admin-review-search">
            Hľadať
            <input
              name="q"
              defaultValue={data.filters.q}
              maxLength={120}
              placeholder="Text, profil alebo meno"
              autoComplete="off"
            />
          </label>
          <button type="submit">Filtrovať</button>
        </form>
        <p className="admin-review-filter-note">
          Vyhľadávanie používa iba text recenzie, názov profilu a zobrazované meno recenzenta. E-mail ani jeho hash sa neprehľadávajú.
        </p>
      </section>

      <section className="admin-review-list" aria-label="Profilové recenzie">
        {data.items.length ? data.items.map((item) => (
          <article key={item.id} className="admin-review-row">
            <div className="admin-review-row-main">
              <div className="admin-review-badges">
                <span className="admin-review-status">{item.status}</span>
                <span aria-label={`Hodnotenie ${item.overallRating} z 5`}>{item.overallRating} / 5 ★</span>
                {item.riskFlags.length ? <span className="admin-review-risk">Risk {item.riskFlags.length}</span> : null}
                {item.reportCount ? <span>Reporty {item.reportCount}</span> : null}
              </div>
              <h2>{item.targetName}</h2>
              <p>{excerpt(item.body)}</p>
              <div className="admin-review-meta">
                <span>{item.entityType}{item.targetCategory ? ` · ${item.targetCategory}` : ""}</span>
                <span>Recenzent: {item.reviewerDisplayName}</span>
                <span>Vytvorené: {formatDate(item.createdAt)}</span>
              </div>
            </div>
            <Link className="admin-review-open" href={`/admin/recenzie-profilov/${item.id}`}>
              Detail →
            </Link>
          </article>
        )) : (
          <div className="admin-review-empty">
            <h2>{data.filters.status === "PENDING_REVIEW"
              ? "Žiadne recenzie čakajúce na kontrolu."
              : "Pre zvolené filtre sa nenašli recenzie."}</h2>
            <p>Skús zmeniť stav, typ profilu alebo vyhľadávanie.</p>
          </div>
        )}
      </section>

      <AdminPagination pagination={data.pagination} basePath={basePath} />
    </AdminShell>
  );
}
