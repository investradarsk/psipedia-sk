import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { AdminPartnerProfileChangeActions } from "@/components/admin-partner-profile-change-actions";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { formatPartnerProfileDiffValue, getPartnerProfileChangeAdmin } from "@/lib/partner-profile-changes-admin";
import "../../partners.css";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAdminPageUser(`/admin/partners/changes/${id}`);
  const change = await getPartnerProfileChangeAdmin(id);
  if (!change) notFound();

  return (
    <AdminShell
      user={user}
      eyebrow="Partner úprava profilu"
      title={change.resourceName}
      description={`${change.statusLabel} · ${change.resourceType} · ${change.changedFields.length} zmenených polí`}
    >
      {change.stale ? (
        <section className="admin-partner-conflict">
          <strong>⚠ STALE_BASE</strong>
          <p>Canonical profil sa od odoslania návrhu zmenil. Porovnajte pôvodnú, aktuálnu a navrhovanú hodnotu. Approval aplikuje iba explicitné polia patchu a neprepíše ostatné aktuálne údaje.</p>
        </section>
      ) : null}
      {change.riskFlags.length ? (
        <section className="admin-form-card">
          <h2>Risk flags</h2>
          <div className="admin-partner-risk-list">{change.riskFlags.map((flag) => <span key={flag}>{flag}</span>)}</div>
        </section>
      ) : null}
      <div className="admin-partner-detail">
        <section className="admin-form-card">
          <h2>Partner</h2>
          <p>{change.email}</p>
          <Link href={`/admin/partners/accounts/${change.accountId}`}>Partner účet →</Link>
        </section>
        <section className="admin-form-card">
          <h2>Profil</h2>
          <p>{change.resourceType} · resource {change.resourceId}</p>
          {change.publicHref ? <Link href={change.publicHref} target="_blank">Verejný profil ↗</Link> : null}
        </section>
      </div>

      {change.media?<section className="admin-form-card admin-partner-media-review">
        <div className="admin-profile-diff-heading"><div><span className="eyebrow">Obrázok</span><h2>CURRENT → PROPOSED</h2></div><p>{change.media.originalMime} · {change.media.width} × {change.media.height}px · {Math.round((change.media.sizeBytes??0)/1024)} kB</p></div>
        <div className="admin-partner-media-compare">
          <div><span>Aktuálny obrázok</span>{change.currentImageUrl?<img src={change.currentImageUrl} alt="Aktuálny verejný obrázok"/>:<p>Bez obrázka</p>}</div>
          <div><span>Navrhovaný obrázok</span><img src={change.media.previewUrl} alt="Navrhovaný Partner obrázok"/></div>
        </div>
      </section>:null}

      <section className="admin-form-card admin-profile-diff">
        <div className="admin-profile-diff-heading">
          <div><span className="eyebrow">Moderation diff</span><h2>OLD → NEW</h2></div>
          <p>Zobrazené sú iba polia, ktoré Partner navrhol zmeniť.</p>
        </div>
        <div className="admin-profile-diff-list">
          {change.diff.map((field) => (
            <article key={field.key} className={field.currentChangedFromBase ? "is-stale" : undefined}>
              <h3>{field.label}</h3>
              {change.stale ? (
                <div className="admin-profile-diff-base">
                  <span>Partner pôvodne videl</span>
                  <pre>{formatPartnerProfileDiffValue(field.baseValue)}</pre>
                </div>
              ) : null}
              <div className="admin-profile-diff-columns">
                <div><span>Aktuálna hodnota</span><pre>{formatPartnerProfileDiffValue(field.currentValue)}</pre></div>
                <div><span>Navrhovaná hodnota</span><pre>{formatPartnerProfileDiffValue(field.proposedValue)}</pre></div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {change.active ? <AdminPartnerProfileChangeActions submissionId={change.id} /> : (
        <section className="admin-form-card"><h2>Rozhodnutie</h2><p>{change.statusLabel}</p>{change.rejectionReasonCode ? <p>Dôvod: {change.rejectionReasonCode}</p> : null}</section>
      )}
    </AdminShell>
  );
}
