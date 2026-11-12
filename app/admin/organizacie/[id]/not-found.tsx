import Link from "next/link";

/** A deleted or nonexistent ID is not a D1 outage. */
export default function OrganizationAdminNotFound() {
  return <main id="obsah" className="admin-root" data-admin-organization-not-found>
    <div className="admin-shell shell">
      <section className="admin-panel" role="status">
        <h1>Organizácia sa nenašla</h1>
        <p>Záznam s uvedeným Admin ID neexistuje alebo bol odstránený.
          Žiadne údaje sa nezmenili.</p>
        <Link href="/admin/organizacie" prefetch={false}>Späť na zoznam organizácií</Link>
      </section>
    </div>
  </main>;
}
