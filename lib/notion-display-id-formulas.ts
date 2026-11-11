import {displayIdScopes,displayIdScope,type DisplayIdKind} from "./admin-display-id";

/**
 * Notion read-only display formula. The existing raw rich-text "Psipedia ID"
 * MUST remain a plain D1 integer to keep webhook LWW and identity mapping safe.
 */
export const NOTION_DISPLAY_ID_FIELD="Zobrazované ID" as const;

export function notionDisplayIdFormula(kind:DisplayIdKind): string {
  const scopes=displayIdScopes.filter(item=>item.kind===kind);
  if(!scopes.length)throw Error("DISPLAY_ID_KIND_UNREGISTERED");
  const raw='format(prop("Psipedia ID"))';
  const fallback=String(displayIdScope(kind).code);
  let suffix='"'+fallback+'"';
  // Only multi-category tables need to read the canonical Notion category.
  if(kind==="directory" || kind==="help") {
    for(const item of [...scopes].filter(x=>x.category!==null).reverse()) {
      suffix='if(prop("Kategória") == "'+item.category+'", "'+item.code+'", '+suffix+')';
    }
  }
  return 'if(empty(prop("Psipedia ID")), "", '+raw+' + "/" + '+suffix+')';
}

/** Schema-only DDL; this never writes any page or overwrites Psipedia ID. */
export function notionDisplayIdSchemaStatement(kind:DisplayIdKind):string {
  const f=notionDisplayIdFormula(kind).replaceAll("'","''");
  return 'ADD COLUMN "'+NOTION_DISPLAY_ID_FIELD+'" FORMULA(\''+f+'\')';
}
