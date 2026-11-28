import { env } from "cloudflare:workers";
import { auditProfileDuplicates, profileDuplicateAgendas, type ProfileDuplicateAgenda } from "@/lib/profile-duplicate-review";
import { manualMappingEditorHref } from "@/lib/notion-manual-transfer-mapping";
import Link from "next/link";
import { Suspense } from "react";
import { AdminShell } from "@/components/admin-shell";
import { AdminDataLoading } from "@/components/admin-data-loading";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getDirectoryDuplicateAudit } from "@/lib/directory-duplicate-audit-store";
import { getDirectoryCategory } from "@/lib/directory";

export const dynamic = "force-dynamic";

async function AuditResults() {
  const audit = await getDirectoryDuplicateAudit();
  return (
    <div className="admin-panel" style={{ padding: 16 }}>
      <h2>Kandidáti na zlúčenie</h2>
      <p>
        Skontrolovaných {audit.scanned} aktívnych profilov. Nájdených {audit.totalCandidates}
        {" "}párov s rovnakým normalizovaným názvom a kompatibilnou lokalitou.
        Zobrazených najviac {audit.candidates.length} párov.
      </p>
      {audit.incomplete && (
        <p role="alert">
          Audit je neúplný: D1 má viac ako 5 000 aktívnych profilov.
          Nič nezlučuj, kým sa neprejde zvyšok databázy.
        </p>
      )}
      <p>
        <strong>Pozor:</strong> Zhoda názvu, webu ani telefónu automaticky
        neznamená totožnú prevádzku. Najprv porovnaj adresu, pobočku,
        recenzie, služby a Notion väzby. Žiadne údaje sa tu nemenia.
      </p>
      {audit.candidates.length === 0 && <p>V tomto behu sa nenašli kandidáti.</p>}
      <div style={{ display: "grid", gap: 12 }}>
        {audit.candidates.map((candidate) => (
          <article key={candidate.a.id + "-" + candidate.b.id}
            style={{ border: "1px solid var(--border-color, #d6ded8)", borderRadius: 12, padding: 12 }}>
            <p style={{ margin: "0 0 8px" }}>
              <strong>{candidate.a.name}</strong>
              {" · "}
              {candidate.confidence === "strong-signals"
                ? "Zhoda názvu a kontaktu/webu"
                : "Zhoda názvu a lokality – preveriť"}
              {candidate.alreadyCrossListed ? " · už má sekundárnu kategóriu" : ""}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {[candidate.a, candidate.b].map(profile => (
                <div key={profile.id} style={{ minWidth: 220, flex: "1 1 220px" }}>
                  <strong>ID {profile.id}</strong>
                  <div>{getDirectoryCategory(profile.category)?.label ?? profile.category}</div>
                  <div>{profile.city || "Mesto nevyplnené"} · {profile.status}</div>
                  <Link href={`/admin/adresar/${profile.id}`}>Otvoriť profil v Admine</Link>
                </div>
              ))}
            </div>
            <p style={{ margin: "8px 0 0" }}>
              Zhody: {candidate.signals.length ? candidate.signals.join(", ") : "iba názov, lokalita chýba"}.
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}

const duplicateLabels:Record<ProfileDuplicateAgenda,string>={directory:"Adresár",breeds:"Plemená",events:"Podujatia",organizations:"Organizácie",adoptions:"Adopcie","lost-found":"Stratené a nájdené","help-cases":"Ostatná pomoc",eshops:"E-shopy"};
async function OtherAgendaAudits(){
  const db=(env as unknown as {DB?:D1Database}).DB;
  if(!db)return <p role="status">D1 nie je dostupná; duplicity ostatných agend neoverené.</p>;
  const results=await Promise.all(profileDuplicateAgendas.filter(agenda=>agenda!=="directory").map(async agenda=>{
    try{return {agenda,audit:await auditProfileDuplicates(db,agenda)};}catch{return {agenda,audit:null};}
  }));
  return <div className="admin-panel" style={{padding:16}}>
    <h2>Duplicity ostatných agend</h2>
    <p>Len kandidáti na ručnú kontrolu. Žiadne automatické zlúčenie ani mazanie.</p>
    {results.map(({agenda,audit})=><details key={agenda}>
      <summary>{duplicateLabels[agenda]} – {audit?`${audit.pairs.length}${audit.truncated?"+":""} párov`:"Neoverené"}</summary>
      {audit?<><p>Skontrolovaných {audit.scanned} záznamov. {audit.incomplete?"Neúplný rozsah (limit 5 000). ":""}{audit.truncated?"Zobrazenie obmedzené na 100 párov.":""}</p>
      {audit.pairs.length>0?<div className="admin-table-scroll"><table className="admin-table">
      <thead><tr><th>Názov</th><th>Záznamy</th><th>Dôvod</th></tr></thead>
      <tbody>{audit.pairs.map(pair=><tr key={pair.a+":"+pair.b}><td>{pair.name}</td><td>{[pair.a,pair.b].map(id=>{
        const href=manualMappingEditorHref(agenda,id);return <span key={id}>{href?<Link href={href} prefetch={false}>#{id}</Link>:"#"+id}{" "}</span>;
      })}</td><td>{pair.reason}</td></tr>)}</tbody></table></div>:<p>V tomto rozsahu sa nenašli kandidáti.</p>}</>:<p>Kontrola sa nepodarila; nejde o nulu duplicít.</p>}
    </details>)}
  </div>;
}

export default async function DirectoryMigrationAuditPage() {
  const user = await requireAdminPageUser("/admin/adresar/migracia");
  return (
    <AdminShell user={user}
      eyebrow="Adresár · bezpečná migrácia"
      title="Duplicity a ďalšie kategórie"
      description="Kontrolný zoznam pred zlúčením profilov. Iba čítanie D1, bez zmien a mazania."
      actions={<Link className="admin-secondary-action" href="/admin/adresar">Späť na adresár</Link>}
    >
      <Suspense fallback={<AdminDataLoading label="Kontrola duplicitných profilov" />}>
        <AuditResults />
      </Suspense>
      <Suspense fallback={<AdminDataLoading label="Kontrola ostatných agend" />}><OtherAgendaAudits /></Suspense>
    </AdminShell>
  );
}
