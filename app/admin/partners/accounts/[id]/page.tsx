import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { AdminPartnerAccountActions } from "@/components/admin-partner-account-actions";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getPartnerAccountAdmin, getPartnerAccountDossierAdmin } from "@/lib/partner-admin-store";
import { partnerAdminStatusLabel, partnerAdminResourceLabel, partnerAdminRoleLabel } from "@/lib/admin-partner-labels";
import "../../partners.css";

export const dynamic = "force-dynamic";

type Membership = {
  id: string;
  resourceId: string;
  role: string;
  createdAt: string;
  revokedAt: string | null;
  resourceName: string;
  entityType: string;
};
type Tab = "ziadosti" | "profily" | "spravy" | "ucet" | "historia";
const tabs: ReadonlyArray<{id:Tab;name:string}> = [
  {id:"ziadosti",name:"Žiadosti"},
  {id:"profily",name:"Profily"},
  {id:"spravy",name:"Správy"},
  {id:"ucet",name:"Účet"},
  {id:"historia",name:"História"},
];
const requestKinds: Record<string,string> = {
  CLAIM:"Prevzatie existujúceho profilu",
  HELP_CLAIM:"Prevzatie Pomoci psom",
  NEW_PROFILE:"Nový profil",
  PROFILE_CHANGE:"Starší návrh úpravy",
  EVENT:"Podujatie",
  HELP_CREATE:"Nový záznam Pomoci psom",
  VERIFICATION:"Overenie správcu",
  COMMERCIAL_INTEREST:"Komerčná žiadosť",
  COMMERCIAL_AGREEMENT:"Komerčná dohoda",
};
const auditActions: Record<string,string> = {
  ACCOUNT_CREATED:"Registrácia účtu",
  EMAIL_VERIFIED:"Overenie e-mailu",
  ACCOUNT_SUSPENDED:"Pozastavenie účtu",
  ACCOUNT_REACTIVATED:"Obnovenie účtu",
  ACCOUNT_DEACTIVATED:"Deaktivácia účtu",
  MEMBERSHIP_CREATED:"Pridelenie správy",
  MEMBERSHIP_ROLE_CHANGED:"Zmena oprávnení",
  MEMBERSHIP_REVOKED:"Odobratie správy",
  CLAIM_SUBMITTED:"Žiadosť o prevzatie",
  CLAIM_APPROVED:"Schválenie prevzatia",
  CLAIM_REJECTED:"Zamietnutie prevzatia",
  NEW_PROFILE_SUBMITTED:"Odoslaný nový profil",
  NEW_PROFILE_CREATED:"Schválenie nového profilu",
  NEW_PROFILE_REJECTED:"Zamietnutie nového profilu",
  EVENT_SUBMITTED:"Odoslané podujatie",
  EVENT_CREATED:"Vytvorenie podujatia",
  EVENT_REJECTED:"Zamietnutie podujatia",
  PROFILE_CHANGE_APPROVED:"Schválenie úpravy",
  CONTACT_PROFILE_COMPLETED:"Doplnenie kontaktu",
  CONTACT_PROFILE_UPDATED:"Zmena kontaktu",
};
const localizedStatus=(status:string)=>({
  published:"Publikované",PUBLISHED:"Publikované",draft:"Koncept",DRAFT:"Koncept",
  OFFERED:"Ponúknutá",AGREED:"Dohodnutá",CONTACTED:"Kontaktovaný",CLOSED:"Uzavreté",
  NOT_NOW:"Teraz nie",RESERVED:"Rezervované",EXPIRED:"Vypršalo",CANCELLED:"Zrušené",
  NEW:"Nové",IN_PROGRESS:"Spracúva sa",
} as Record<string,string>)[status]??partnerAdminStatusLabel(status);

export default async function Page({
  params,searchParams,
}:{
  params:Promise<{id:string}>;
  searchParams:Promise<{tab?:string|string[];page?:string|string[]}>;
}) {
  const {id}=await params;
  const user=await requireAdminPageUser(`/admin/partners/accounts/${id}`);
  const account=await getPartnerAccountAdmin(id);
  if(!account)notFound();

  const options=await searchParams;
  const rawTab=typeof options.tab==="string"?options.tab:"ziadosti";
  const tab:Tab=tabs.some(item=>item.id===rawTab)?rawTab as Tab:"ziadosti";
  const rawPage=typeof options.page==="string"?Number(options.page):1;
  const page=Number.isSafeInteger(rawPage)&&rawPage>0?Math.min(rawPage,10000):1;
  const dossier=await getPartnerAccountDossierAdmin({accountId:id,tab,page});
  const memberships=account.memberships as Membership[];
  const profile=account.contactProfile;
  const mainHref=`/admin/partners/accounts/${encodeURIComponent(id)}`;
  const tabHref=(next:Tab,number=1)=>`${mainHref}?tab=${next}${number>1?`&page=${number}`:""}`;
  const pagination=(current:number,totalPages:number)=>{
    if(totalPages<=1)return null;
    return (
      <nav className="admin-partner-pagination" aria-label="Stránkovanie záložky">
        {current>1&&<Link href={tabHref(tab,current-1)}>← Predchádzajúca</Link>}
        <span>Strana {current} z {totalPages}</span>
        {current<totalPages&&<Link href={tabHref(tab,current+1)}>Ďalšia →</Link>}
      </nav>
    );
  };

  return (
    <AdminShell user={user} eyebrow="Partner účet"
      title={profile?.contactName||account.email}
      description={`${partnerAdminStatusLabel(account.status)} · registrovaný ${new Date(account.createdAt).toLocaleDateString("sk-SK")}`}>
      <div className="admin-partner-v2-back">
        <Link href="/admin/partners">← Všetci partneri</Link>
      </div>
      <section className="admin-form-card admin-partner-v2-summary" aria-label="Prehľad partnera">
        <div className="admin-partner-v2-contact">
          <h2>{profile?.contactName||"Meno zatiaľ neuvedené"}</h2>
          <p>{account.email}</p>
          {profile?.phone&&<p>Tel.: {profile.phone}</p>}
          {profile?.relationship&&<p>{profile.relationship}</p>}
        </div>
        <div className="admin-partner-v2-stats">
          <Link href={tabHref("ziadosti")}>
            <span>Čakajúce žiadosti</span>
            <strong>{dossier.requests.pending}</strong>
          </Link>
          <Link href={tabHref("profily")}>
            <span>Spravované profily</span>
            <strong>{dossier.profiles.total}</strong>
          </Link>
          <Link href={tabHref("spravy")}>
            <span>Neprečítané správy</span>
            <strong aria-label="Chat zatiaľ nie je dostupný">—</strong>
          </Link>
        </div>
      </section>

      <nav className="admin-partner-v2-tabs" aria-label="Sekcie detailu partnera">
        {tabs.map(item=><Link key={item.id} href={tabHref(item.id)}
          aria-current={tab===item.id?"page":undefined}
          className={tab===item.id?"is-active":undefined}>{item.name}</Link>)}
      </nav>

      {tab==="ziadosti"&&(
        <section className="admin-form-card admin-partner-v2-panel" data-admin-partner-requests>
          <div className="admin-partner-v2-panel-heading">
            <h2>Žiadosti partnera</h2>
            <span>Všetky podania: {dossier.requests.total} · Čaká: {dossier.requests.pending}</span>
          </div>
          {dossier.requests.items.length?(
            <div className="admin-partner-v2-records">
              {dossier.requests.items.map(item=>(
                <article key={`${item.kind}-${item.id}`}>
                  <div>
                    <small>{requestKinds[item.kind]??"Žiadosť"} · {partnerAdminResourceLabel(item.entityType)}</small>
                    <h3>{item.title}</h3>
                    <p>Odoslané {new Date(item.createdAt).toLocaleString("sk-SK")}</p>
                  </div>
                  <div className="admin-partner-v2-record-actions">
                    <span className={item.pending?"is-pending":undefined}>{localizedStatus(item.status)}</span>
                    <Link href={item.requestHref}>Otvoriť žiadosť</Link>
                    {item.editorHref&&<Link href={item.editorHref}>Otvoriť editor</Link>}
                  </div>
                </article>
              ))}
            </div>
          ):(
            <p role="status" className="admin-partner-v2-empty">Zatiaľ nepodal žiadnu žiadosť.</p>
          )}
          {pagination(dossier.requests.page,dossier.requests.totalPages)}
        </section>
      )}

      {tab==="profily"&&(
        <section className="admin-form-card admin-partner-v2-panel" data-admin-partner-profiles>
          <div className="admin-partner-v2-panel-heading">
            <h2>Spravované profily</h2><span>Aktívne priradené: {dossier.profiles.total}</span>
          </div>
          {dossier.profiles.items.length?(
            <div className="admin-partner-v2-records">
              {dossier.profiles.items.map(item=>(
                <article key={`${item.entityType}-${item.id}`}>
                  <div>
                    <small>{partnerAdminResourceLabel(item.entityType)}</small>
                    <h3>{item.name}</h3>
                    <p>{localizedStatus(item.status)} · Správa od {new Date(item.grantedAt).toLocaleDateString("sk-SK")}</p>
                  </div>
                  <div className="admin-partner-v2-record-actions">
                    {item.editorHref&&<Link href={item.editorHref}>Otvoriť profil v Admine</Link>}
                  </div>
                </article>
              ))}
            </div>
          ):(
            <p role="status" className="admin-partner-v2-empty">Partner zatiaľ nespravuje žiadny profil.</p>
          )}
          {pagination(dossier.profiles.page,dossier.profiles.totalPages)}
        </section>
      )}

      {tab==="spravy"&&(
        <section className="admin-form-card admin-partner-v2-panel" data-admin-partner-messages>
          <h2>Správy</h2>
          <p>Súkromný rozhovor s týmto partnerom pripravujeme v kroku 7/8. Dovtedy sa správy nezobrazujú ani nepočítajú ako prečítané či neprečítané.</p>
        </section>
      )}

      {tab==="ucet"&&(
        <>
          <div className="admin-partner-detail">
            <section className="admin-form-card">
              <h2>Kontakt</h2>
              <p><strong>Meno a priezvisko:</strong> {profile?.contactName||"Nevyplnené"}</p>
              <p><strong>E-mail:</strong> {account.email}</p>
              {profile?.phone&&<p><strong>Telefón:</strong> {profile.phone}</p>}
              {profile?.relationship&&<p><strong>Úloha / vzťah:</strong> {profile.relationship}</p>}
              {profile?<p>Kontaktné údaje dokončené: {new Date(profile.completedAt).toLocaleString("sk-SK")}</p>:<p>Partner ešte nedokončil kontaktné údaje.</p>}
            </section>
            <section className="admin-form-card">
              <h2>Účet a sessions</h2>
              <p>Stav: {partnerAdminStatusLabel(account.status)}</p>
              <p>Overený e-mail: {account.emailVerifiedAt?new Date(account.emailVerifiedAt).toLocaleString("sk-SK"):"nie"}</p>
              <p>Sessions: {String((account.sessions as {active?:number}).active??0)} aktívnych</p>
            </section>
            <section className="admin-form-card">
              <h2>Prihlasovacie metódy</h2>
              <p><strong>Magic link:</strong> dostupný</p>
              <p><strong>Heslo:</strong> {account.authMethods.passwordSet?"nastavené":"nenastavené"}</p>
              <p><strong>Google:</strong> {account.authMethods.googleLinked?"prepojené":"neprepojené"}</p>
              {account.authMethods.googleLinkedAt&&<p>Google prepojené: {new Date(account.authMethods.googleLinkedAt).toLocaleString("sk-SK")}</p>}
            </section>
          </div>
          <AdminPartnerAccountActions accountId={account.id} status={account.status} memberships={memberships} />
        </>
      )}

      {tab==="historia"&&(
        <section className="admin-form-card admin-partner-v2-panel" data-admin-partner-history>
          <div className="admin-partner-v2-panel-heading">
            <h2>História účtu a rozhodnutí</h2>
            <span>Zaznamenané udalosti: {dossier.history?.total??0}</span>
          </div>
          {dossier.history?.items.length?(
            <div className="admin-partner-v2-records">
              {dossier.history.items.map(item=>(
                <article key={item.id}>
                  <div>
                    <h3>{auditActions[item.action]??item.action.replaceAll("_"," ").toLocaleLowerCase("sk")}</h3>
                    <p>{new Date(item.createdAt).toLocaleString("sk-SK")}</p>
                    <small>{item.actorType==="PARTNER"?"Partner":item.actorType==="ADMIN"?"Administrátor":"Systém"}</small>
                  </div>
                </article>
              ))}
            </div>
          ):<p className="admin-partner-v2-empty">Bez historických udalostí. Staršie účty nemusia mať kompletný audit.</p>}
          {dossier.history&&pagination(dossier.history.page,dossier.history.totalPages)}
          <div className="admin-partner-v2-history-memberships">
            <h3>História prístupov</h3>
            {memberships.length?memberships.map(m=>(
              <article key={m.id}>
                <strong>{m.resourceName||"Profil"}</strong>
                <span>{partnerAdminResourceLabel(m.entityType)} · {partnerAdminRoleLabel(m.role)} · {m.revokedAt?"Odobratý prístup":"Aktívny prístup"}</span>
              </article>
            )):<p>Žiadny prístup zatiaľ nebol pridelený.</p>}
          </div>
          <p className="admin-partner-v2-audit-note">Podrobné rozdiely pred/po jednotlivých úpravách doplníme v kroku 5/8.</p>
        </section>
      )}
    </AdminShell>
  );
}
