import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { ESHOP_RATING_FIELDS } from "@/lib/eshop-rating-domain";
import { listManagedEshops } from "@/lib/eshop-ratings";
import styles from "./eshops-admin.module.css";

export const dynamic = "force-dynamic";

function format(value: number) {
  return new Intl.NumberFormat("sk-SK", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

export default async function AdminEshopsPage() {
  const user = await requireAdminPageUser("/admin/recenzie/eshopy");
  const shops = await listManagedEshops().catch(() => []);

  return (
    <AdminShell
      user={user}
      eyebrow="Recenzie a testy"
      title="E-shopy"
      description="Samostatné profily e-shopov a ich overené používateľské hodnotenia. Externé skóre sa do priemeru Psipedia nezapočítava."
      actions={<Link className="admin-primary-action" href="/recenzie?typ=eshopy" target="_blank">Verejné e-shopy ↗</Link>}
    >
      <div className={styles.list}>
        {shops.map((shop) => (
          <article className={styles.card} key={shop.id}>
            <div className={styles.logo}>{shop.logoUrl ? <img src={shop.logoUrl} alt="" /> : <span>LOGO</span>}</div>
            <div className={styles.main}>
              <div className={styles.topline}>
                <span data-status={shop.status}>{shop.status === "published" ? "Publikovaný" : shop.status === "archived" ? "Archivovaný" : "Koncept"}</span>
                <small>ID {shop.id}</small>
              </div>
              <h2>{shop.name}</h2>
              <p>{shop.description}</p>
              {shop.focusTags.length ? <div className={styles.tags}>{shop.focusTags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
              <div className={styles.links}>
                <a href={shop.websiteUrl} target="_blank" rel="noreferrer">Web e-shopu ↗</a>
                <a href={shop.sourceUrl} target="_blank" rel="noreferrer">Zdroj profilu ↗</a>
                {shop.status === "published" ? <Link href={`/recenzie/eshopy/${shop.slug}`} target="_blank">Profil Psipedia ↗</Link> : null}
                <Link className={styles.editLink} href={`/admin/recenzie/eshopy/${shop.id}`}>Upraviť profil</Link>
              </div>
            </div>
            <div className={styles.rating}>
              {shop.averages ? (
                <>
                  <strong>{format(shop.averages.overall)} ★</strong>
                  <span>{shop.ratingCount} hodnotení</span>
                  <dl>
                    {ESHOP_RATING_FIELDS.slice(0,4).map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{format(shop.averages?.[field.key] ?? 0)}</dd></div>)}
                  </dl>
                </>
              ) : (
                <><strong>—</strong><span>Zatiaľ bez hodnotení</span></>
              )}
            </div>
          </article>
        ))}
        {!shops.length ? <div className={styles.empty}>E-shopy sa momentálne nepodarilo načítať.</div> : null}
      </div>
    </AdminShell>
  );
}
