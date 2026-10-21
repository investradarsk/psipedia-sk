import {notionFlagEnabled} from "@/lib/notion-sync-shared";

/** Opt-in only: legacy Notion records are not retroactively authorized. */
export type FacebookImageScheduleV2Bindings = {
  NOTION_FACEBOOK_IMAGES_SCHEDULE_V2_ENABLED?: string;
  NOTION_FACEBOOK_IMAGES_SCHEDULE_V2_CUTOVER_AT?: string;
};
export function facebookImageScheduleV2Policy(bindings:FacebookImageScheduleV2Bindings) {
  const enabled=notionFlagEnabled(bindings.NOTION_FACEBOOK_IMAGES_SCHEDULE_V2_ENABLED);
  const raw=bindings.NOTION_FACEBOOK_IMAGES_SCHEDULE_V2_CUTOVER_AT??"";
  // Date.parse accepts local timestamps, offsets and normalized invalid dates.
  // Those must never change which historical Notion pages are authorized.
  const parts=/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.(\d{3}))?Z$/.exec(raw);
  const cutover=parts?Date.parse(raw):Number.NaN;
  const canonical=parts&&Number.isFinite(cutover)
    &&new Date(cutover).toISOString()===parts[1]+"T"+parts[2]+"."+(parts[3]??"000")+"Z";
  if(enabled&&(!canonical||cutover<=0))
    throw new Error("Facebook schedule V2 requires an explicit valid UTC ISO-8601 cutover timestamp.");
  return {enabled,cutover:enabled?cutover:0};
}
export function notionFacebookScheduleV2Decision(input:{
  scheduledAt:string|null; imageAvailable:boolean; notionState:string;
  lastEditedAt?:string; now:Date; cutover:number;
  wasScheduled?:boolean; currentScheduledAt?:string|null;
}) {
  const edited=Date.parse(input.lastEditedAt??"");
  const fresh=Number.isFinite(edited)&&edited>=input.cutover;
  // Existing records before activation are never silently made eligible.
  if(!fresh)return {eligible:false,fresh:false};
  const when=input.scheduledAt?Date.parse(input.scheduledAt):NaN;
  if(!Number.isFinite(when)||!input.imageAvailable)return {eligible:false,fresh:true};
  // A change to Koncept cancels an existing scheduled item, even if the
  // operator left the old date in Notion. A new Concept with a date schedules.
  if(input.wasScheduled&&input.notionState==="Koncept"
    &&input.scheduledAt===input.currentScheduledAt)
    return {eligible:false,fresh:true};
  // A past date entered after it has elapsed is not an outage catch-up.
  // A genuinely pre-existing schedule may catch up after a worker outage.
  if(when<=input.now.getTime()&&edited>when
    &&!(input.wasScheduled&&input.currentScheduledAt===input.scheduledAt
      &&input.notionState==="Naplánované"))
    return {eligible:false,fresh:true};
  return {eligible:true,fresh:true};
}
