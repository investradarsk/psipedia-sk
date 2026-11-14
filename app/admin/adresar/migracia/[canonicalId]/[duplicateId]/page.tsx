import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getDirectoryCategory } from "@/lib/directory";
import {
  getDirectoryMergePreflight, parseMergeProfileId,
  MERGE_DEPENDENCY_FIELDS,
  type DirectoryMergePreflightProfile,
} from "@/lib/directory-merge-preflight";

export const dynamic = "force-dynamic";

const fieldNames: Record<string,string> = {
  partner_resources: "Partnerské zdroje",
  reviews: "Recenzie",
  memberships: "Partnerské členstvá",
  claims: "Nároky na profil",
  verifications: "Overenia partnerov",
  entitlements: "Partnerské oprávnenia",
  commercial_interests: "Obchodné záujmy",
  commercial_agreements: "Obchodné dohody",
  partner_change_requests: "Partnerské úpravy",
  notion_links: "Notion prepojenia",
  geo_points: "Mapové body",
  service_choices: "Voľby služieb",
  service_properties: "Atribúty služieb",
  breed_links: "Prepojenia plemien",
  help_links: "Prepojenia organizácií",
  inquiries: "Dopyty",
  profile_change_requests: "Podnety k profilu",
};

function ProfileColumn({ title, profile }: {
  title: string;
  profile: DirectoryMergePreflightProfile;
}) {
  const details = [
    ["Kategória", getDirectoryCategory(profile.category)?.label ?? profile.category],
    ["Stav", profile.status],
    ["Mesto", profile.city || "—"],
    ["Adresa", profile.address || "—"],
    ["Web", profile.website_url || "—"],
    ["Telefón", profile.phone || "—"],
    ["E-mail", profile.email || "—"],
    ["Dĺžka perexu", String(profile.excerptLength)],
    ["Dĺžka opisu", String(profile.descriptionLength)],
    ["Fotografia", profile.image_url ? "Áno" : "Nie"],
    ["Sekundárne kategórie", profile.additionalCategories.join(", ") || "—"],
  ];
  return (
    <section style={{ border: "1px solid #d5ddd8", borderRadius: 12, padding: 12, minWidth: 0 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: "1.1rem" }}>{title} · ID {profile.id}</h2>
      <p style={{ margin: "0 0 8px" }}><strong>{profile.name}</strong></p>
      <Link href={`/admin/adresar/${profile.id}`}>Otvoriť editor</Link>
      <dl style={{ display: "grid", gridTemplateColumns: "minmax(100px, 38%) 1fr", gap: "6px 8px", marginTop: 12 }}>
        {details.map(([label,value]) => (
          <div key={label} style={{ display: "contents" }}>
            <dt style={{ overflowWrap: "anywhere", opacity: .72 }}>{label}</dt>
            <dd style={{ margin: 0, overflowWrap: "anywhere" }}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default async function DirectoryMergePreflightPage({ params }: {
  params: Promise<{ canonicalId: string; duplicateId: string }>;
}) {
  const raw = await params;
  const canonicalId = parseMergeProfileId(raw.canonicalId);
  const duplicateId = parseMergeProfileId(raw.duplicateId);
  if (!canonicalId || !duplicateId || canonicalId === duplicateId) notFound();
  const user = await requireAdminPageUser("/admin/adresar/migracia");
  const preflight = await getDirectoryMergePreflight(canonicalId, duplicateId);
  if (!preflight) notFound();
  const { canonical, duplicate, blockingReasons } = preflight;

  return (
    <AdminShell user={user}
      eyebrow="Adresár · kontrola migrácie"
      title={`Porovnanie ID ${canonical.id} a ${duplicate.id}`}
      description="Bezpečnostná kontrola pred migráciou. Stránka nič nemení ani neodosiela do Notionu."
      actions={<Link className="admin-secondary-action" href="/admin/adresar/migracia">Späť k duplicitám</Link>}
    >
      <div className="admin-panel" style={{ padding: 14 }}>
        <p><strong>Predbežný návrh:</strong> ponechať ID {canonical.id}, preveriť ID {duplicate.id}.
          Nižšie sú aktuálne hodnoty z D1, nie súhlas so zlúčením.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 12 }}>
          <ProfileColumn title="Kanonický návrh" profile={canonical} />
          <ProfileColumn title="Kandidát na zlúčenie" profile={duplicate} />
        </div>
        <h2 style={{ fontSize: "1.1rem", marginTop: 20 }}>Naviazané údaje</h2>
        <p>Počty riadkov viazaných na oba profily. Nula neznamená, že je automatické zmazanie bezpečné.</p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead><tr><th>Vzťah</th><th>ID {canonical.id}</th><th>ID {duplicate.id}</th></tr></thead>
            <tbody>
              {MERGE_DEPENDENCY_FIELDS.map(key => (
                <tr key={key} style={{ borderTop: "1px solid #d5ddd8" }}>
                  <td style={{ padding: "7px 4px" }}>{fieldNames[key] ?? key}</td>
                  <td style={{ padding: "7px 4px" }}>{canonical[key]}</td>
                  <td style={{ padding: "7px 4px" }}><strong>{duplicate[key]}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h2 style={{ fontSize: "1.1rem", marginTop: 20 }}>Podmienky pred zlúčením</h2>
        <ul>
          {blockingReasons.map(reason => <li key={reason}>{reason}</li>)}
        </ul>
        <p><strong>Zlúčenie je zatiaľ vypnuté.</strong> Najprv treba zabezpečiť prenos alebo zobrazenie
          recenzií, partnerských oprávnení, väzieb, Notion identít a trvalé presmerovanie pôvodnej URL.</p>
      </div>
    </AdminShell>
  );
}
