/**
 * Services V3: present canonical D1 persistence and Notion reconciliation
 * independently. A successful D1 response must never be presented as a
 * verified Notion write when its mirror outcome is missing or uncertain.
 */
export type ServiceChoiceNotionProjection="updated"|"unchanged"|"deferred";
export type ServiceChoiceNotionFieldSync="disabled"|"unlinked"|"synced"|"unchanged"|"pending";
export type ServiceChoiceSyncOutcome=Readonly<{
  notionProjection?:ServiceChoiceNotionProjection;
  notionFieldSync?:ServiceChoiceNotionFieldSync;
  warning?:string;
}>;
export type ServiceChoiceSyncFeedback=Readonly<{
  savedCount:number;
  confirmedCount:number;
  unchangedCount:number;
  pendingCount:number;
  unlinkedCount:number;
  disabledCount:number;
  needsAttention:boolean;
  message:string;
}>;

export function summarizeServiceChoiceSync(outcomes:readonly ServiceChoiceSyncOutcome[]):ServiceChoiceSyncFeedback{
  let confirmedCount=0,unchangedCount=0,pendingCount=0,unlinkedCount=0,disabledCount=0;
  for(const outcome of outcomes){
    // Missing fields from a stale or partial API response are not proof of sync.
    // A failed local legacy projection also invalidates a remote success claim.
    const state=outcome.notionProjection==="deferred"?"pending":outcome.notionFieldSync??"pending";
    switch(state){
      case "synced":confirmedCount++;break;
      case "unchanged":unchangedCount++;break;
      case "unlinked":unlinkedCount++;break;
      case "disabled":disabledCount++;break;
      default:pendingCount++;
    }
  }
  const savedCount=outcomes.length;
  const notices:string[]=[];
  if(confirmedCount)notices.push(`potvrdené ${confirmedCount}`);
  if(unchangedCount)notices.push(`overené bez zmeny ${unchangedCount}`);
  if(pendingCount)notices.push(`čaká na kontrolu ${pendingCount}`);
  if(unlinkedCount)notices.push(`bez prepojenia ${unlinkedCount}`);
  if(disabledCount)notices.push(`synchronizácia vypnutá ${disabledCount}`);
  const warnings=[...new Set(outcomes.map(x=>x.warning).filter((x):x is string=>typeof x==="string"&&x.trim().length>0))];
  const needsAttention=pendingCount>0||unlinkedCount>0||disabledCount>0||warnings.length>0;
  return {
    savedCount,confirmedCount,unchangedCount,pendingCount,unlinkedCount,disabledCount,needsAttention,
    message:`V Psipedii uložené: ${savedCount}. ${savedCount?`Notion: ${notices.join(", ")}.`:""}`
      +(warnings.length?` ${warnings.join(" ")}`:"")
      +(needsAttention?" Skontroluj prepojenie alebo stav synchronizácie v Notione.":""),
  };
}
