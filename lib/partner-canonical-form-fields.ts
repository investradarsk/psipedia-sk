/**
 * Shared definition of the first-create and post-approval public fields.
 * Supplied server-side to the client (never import server D1/auth modules into a client component).
 */
import { getPartnerEditableFields } from "./partner-profile-changes";
import { partnerEventFields } from "./partner-event-fields";
import { helpEditorFields } from "./partner-help-editor-fields";
import { directoryCategories } from "./directory";
import type { PartnerCanonicalType } from "./partner-canonical-workflow";

export type CanonicalFieldKind="text"|"textarea"|"select"|"url"|"date"|"time"|"number"|"checkbox"|"nullableBoolean"|"list";
export type CanonicalFormField={
  key:string;label:string;kind:CanonicalFieldKind;
  required:boolean;options?:string[];max?:number;minimum?:number;maximum?:number;
};
const make=(key:string,label:string,kind:CanonicalFieldKind="text",options?:readonly string[]):CanonicalFormField=>
  ({key,label,kind,required:false,...(options?{options:[...options]}:{})});

/** Only type/category routing is mandatory in an unpublished draft. */
export function getPartnerCanonicalFormFields():Record<PartnerCanonicalType,CanonicalFormField[]>{
  const copy=(type:"DIRECTORY_PROFILE"|"HELP_ORGANIZATION")=>
    getPartnerEditableFields(type).map(field=>({
      key:field.key,label:field.label,kind:field.kind as CanonicalFieldKind,
      required:false,...(field.options?{options:[...field.options]}:{}),
    }));
  const help=(type:"ADOPTION_DOG"|"LOST_FOUND_DOG"|"HELP_CASE")=>
    helpEditorFields[type].map(field=>({
      key:field.key,label:field.label,kind:field.kind as CanonicalFieldKind,required:false,
      ...(field.options?{options:[...field.options]}:{}),
      ...(field.max!==undefined?{max:field.max}:{}),
      ...(field.minimum!==undefined?{minimum:field.minimum}:{}),
      ...(field.maximum!==undefined?{maximum:field.maximum}:{}),
    }));
  return {
    DIRECTORY_PROFILE:[
      {...make("category","Hlavná kategória","select",directoryCategories.map(item=>item.slug)),required:true},
      ...copy("DIRECTORY_PROFILE"),
    ],
    HELP_ORGANIZATION:copy("HELP_ORGANIZATION").map(field=>
      field.key==="type"?{...field,required:true}:field),
    MANAGED_EVENT:partnerEventFields.map(field=>({
      key:field.key,label:field.label,kind:field.kind as CanonicalFieldKind,required:false,
      ...("options" in field&&field.options?{options:[...field.options]}:{}),
    })).concat([make("cancelled","Podujatie je zrušené","checkbox")]),
    ADOPTION_DOG:help("ADOPTION_DOG"),
    LOST_FOUND_DOG:[
      {...make("type","Typ hlásenia","select",["LOST","FOUND"]),required:true},
      ...help("LOST_FOUND_DOG"),
    ],
    HELP_CASE:help("HELP_CASE").map(field=>
      field.key==="category"?{...field,required:true}:field),
  };
}
