import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import {
  countNewPartnerCommercialInterests,
  listPartnerCommercialInterestsAdmin,
} from "@/lib/partner-commercial-admin";
import {
  getPartnerCommercialAdminSummary,
  listPartnerCommercialAgreementsAdmin,
} from "@/lib/partner-commercial-agreements";
import {
  partnerCommercialInterestTypes,
  partnerCommercialStatuses,
} from "@/lib/partner-commercial";
import {
  isPartnerCommercialInterestType,
  isPartnerCommercialStatus,
} from "@/lib/partner-commercial";
import {
  partnerCommercialStatusLabel,
  partnerCommercialTypeLabel,
  partnerPaymentStatusLabel,
} from "@/lib/partner-ui-labels";
import "../partners.css";
export const dynamic = "force-dynamic";
type Search = { status?: string | string[]; type?: string | string[]; q?: string | string[] };
function euro(cents: number) {
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR" }).format(cents / 100);
}
export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireAdminPageUser("/admin/partners/commercial"),
    raw = await searchParams,
    status =
      raw.status === "all" ||
      (typeof raw.status === "string" && isPartnerCommercialStatus(raw.status))
        ? raw.status
        : "NEW",
    interestType =
      typeof raw.type === "string" && isPartnerCommercialInterestType(raw.type) ? raw.type : "all",
    q = typeof raw.q === "string" ? raw.q : "";
  const [items, agreements, commercialSummary, newInterests] = await Promise.all([
    listPartnerCommercialInterestsAdmin({ status, interestType, q }),
    listPartnerCommercialAgreementsAdmin(),
    getPartnerCommercialAdminSummary(),
    countNewPartnerCommercialInterests(),
  ]);
  return (
    <AdminShell
      user={user}
      eyebrow="Partneri"
      title="Komerčné žiadosti"
      description="Prehľad záujmu partnerov o propagáciu, dohôd a platieb."
    >
      <section className="admin-form-card">
        <h2>Prehľad</h2>
        <div className="admin-commercial-list">
          <article>
            <strong>{newInterests}</strong>
            <span>nové žiadosti</span>
          </article>
          <article>
            <strong>{commercialSummary.awaitingPayment}</strong>
            <span>čaká na platbu</span>
          </article>
          <article>
            <strong>{commercialSummary.readyToActivate}</strong>
            <span>pripravené na aktiváciu</span>
          </article>
          <article>
            <strong>{commercialSummary.active}</strong>
            <span>aktívne komerčné položky</span>
          </article>
          <article>
            <strong>{commercialSummary.expiringSoon}</strong>
            <span>končí do 14 dní</span>
          </article>
        </div>
      </section>
      <section className="admin-form-card">
        <h2>Dohody</h2>
        <div className="admin-commercial-list">
          {agreements.length ? (
            agreements.map((a) => (
              <article key={a.id}>
                <div>
                  <strong>{a.resourceName ?? partnerCommercialTypeLabel(a.agreementType)}</strong>
                  <small>
                    {partnerCommercialTypeLabel(a.agreementType)} · {euro(a.priceCents)}
                  </small>
                </div>
                <span>{partnerCommercialStatusLabel(a.status)}</span>
                <span>{partnerPaymentStatusLabel(a.paymentStatus)}</span>
                <span>{new Date(a.endAt).toLocaleDateString("sk-SK")}</span>
                <Link href={`/admin/partners/commercial/agreements/${a.id}`}>Detail dohody →</Link>
              </article>
            ))
          ) : (
            <p>Zatiaľ nie sú vytvorené žiadne dohody.</p>
          )}
        </div>
      </section>
      <section className="admin-form-card">
        <h2>Zoznam žiadostí</h2>
        <form className="admin-commercial-filters">
          <label>
            Stav
            <select name="status" defaultValue={status}>
              <option value="all">Všetky</option>
              {partnerCommercialStatuses.map((x) => (
                <option key={x} value={x}>
                  {partnerCommercialStatusLabel(x)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Typ
            <select name="type" defaultValue={interestType}>
              <option value="all">Všetky</option>
              {partnerCommercialInterestTypes.map((x) => (
                <option key={x} value={x}>
                  {partnerCommercialTypeLabel(x)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Hľadať
            <input name="q" defaultValue={q} />
          </label>
          <button>Filtrovať</button>
        </form>
        <div className="admin-commercial-list">
          {items.length ? (
            items.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.resourceName ?? item.email}</strong>
                  <small>
                    {item.email} · {partnerCommercialTypeLabel(item.interestType)}
                  </small>
                </div>
                <span>{partnerCommercialStatusLabel(item.status)}</span>
                <span>{new Date(item.createdAt).toLocaleString("sk-SK")}</span>
                <p>{item.message ?? "Bez správy"}</p>
                <Link href={`/admin/partners/commercial/${item.id}`}>Detail →</Link>
              </article>
            ))
          ) : (
            <p>Žiadne žiadosti pre zvolený filter.</p>
          )}
        </div>
      </section>
    </AdminShell>
  );
}
