/** Read-only Partner activity: existing decisions/outbox + private messages.
 * Turning off in-app alerts hides reminders, never hides history or decisions.
 */
import { env } from "cloudflare:workers";
import { getPartnerDatabase } from "./partner-auth-store";

const descriptions:Record<string,string>={
  CLAIM_SUBMITTED:"Žiadosť o správu profilu bola prijatá",
  CLAIM_APPROVED:"Žiadosť o správu profilu bola schválená",
  CLAIM_REJECTED:"Žiadosť o správu profilu bola zamietnutá",
  VERIFICATION_APPROVED:"Overenie správcu bolo schválené",
  VERIFICATION_REJECTED:"Overenie správcu nebolo schválené",
  PROFILE_CHANGE_SUBMITTED:"Návrh úprav profilu bol odoslaný",
  PROFILE_CHANGE_APPROVED:"Zmeny profilu boli schválené",
  PROFILE_CHANGE_REJECTED:"Zmeny profilu neboli schválené",
  NEW_PROFILE_SUBMITTED:"Nový profil čaká na kontrolu",
  NEW_PROFILE_CREATED:"Bol schválený nový profil",
  NEW_PROFILE_LINKED_EXISTING:"Nový profil bol prepojený s existujúcim",
  NEW_PROFILE_REJECTED:"Nový profil nebol schválený",
  EVENT_SUBMITTED:"Podujatie čaká na kontrolu",
  EVENT_CREATED:"Bol schválený návrh podujatia",
  EVENT_LINKED_EXISTING:"Podujatie bolo prepojené",
  EVENT_CHANGE_APPROVED:"Úpravy podujatia boli schválené",
  EVENT_REJECTED:"Návrh podujatia nebol schválený",
  COMMERCIAL_OFFER_CREATED:"V účte máte novú obchodnú ponuku",
  COMMERCIAL_AGREEMENT_UPDATED:"Aktualizácia obchodnej dohody",
  PAYMENT_MARKED_PAID:"Platba bola zaevidovaná",
  ENTITLEMENT_ACTIVATED:"Benefit bol aktivovaný",
  ENTITLEMENT_EXPIRING:"Benefit sa blíži ku koncu",
  ENTITLEMENT_EXPIRED:"Platnosť benefitu sa skončila",
};
export type PartnerActivity={id:string;title:string;createdAt:string;href:string;kind:"MESSAGE"|"DECISION"};
export async function listPartnerActivity(input:{accountId:string;database?:D1Database}){
  const db=getPartnerDatabase(input.database??(env as unknown as {DB?:D1Database}).DB);
  const [notices,chat]=await Promise.all([
    db.prepare("SELECT id,notification_type notificationType,created_at createdAt "+
      "FROM partner_notification_outbox WHERE partner_account_id=? "+
      "AND notification_type NOT IN ('AUTH_MAGIC_LINK','PASSWORD_RESET') "+
      "ORDER BY created_at DESC LIMIT 40")
      .bind(input.accountId).all<{id:string;notificationType:string;createdAt:string}>(),
    db.prepare("SELECT id,created_at createdAt FROM partner_chat_messages "+
      "WHERE partner_account_id=? AND sender_role='ADMIN' "+
      "ORDER BY created_at DESC LIMIT 40")
      .bind(input.accountId).all<{id:string;createdAt:string}>(),
  ]);
  const combined:PartnerActivity[]=[
    ...notices.results.map(row=>({
      id:"notice-"+row.id,title:descriptions[row.notificationType]??"Aktualizácia partnerského účtu",
      createdAt:row.createdAt,
      href:row.notificationType.startsWith("COMMERCIAL_")||row.notificationType.startsWith("ENTITLEMENT_")||
        row.notificationType==="PAYMENT_MARKED_PAID"?"/partner/propagacia":"/partner/ziadosti",
      kind:"DECISION" as const,
    })),
    ...chat.results.map(row=>({
      id:"chat-"+row.id,title:"Nová súkromná správa od Psipedie",
      createdAt:row.createdAt,href:"/partner/spravy",kind:"MESSAGE" as const,
    })),
  ];
  return combined.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id)).slice(0,60);
}
