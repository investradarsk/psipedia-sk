import { normalizeSimilarText } from "./visual-library-similarity.ts";

type ArticleIdentity={id?:number;title?:unknown;excerpt?:unknown;intro?:unknown;blocks?:unknown;takeaway?:unknown;status?:string};
type Candidate={id:number;title:string;status:string;reason:"SAME_TITLE"|"SIMILAR_TITLE"|"SAME_BODY"|"SIMILAR_BODY";score:number};
export type ArticleSimilarityReport={candidates:Candidate[];scanned:number;incomplete:boolean};
const MAX_ROWS=1000;
const text=(v:unknown)=>typeof v==="string"?v:"";
const normalize=(v:unknown)=>normalizeSimilarText(text(v));
const ignored=new Set(["ako","pre","pri","nie","ale","alebo","aby","ktory","ktore","ktora","tento","tato","toto","vas","vase","psa","psy","psov","pes"]);
function words(v:string){return v.split(" ").filter(Boolean);}
function keywords(v:string){return new Set(words(v).filter(w=>w.length>=3&&!ignored.has(w)));}
function intersection(a:Set<string>,b:Set<string>){let n=0;for(const k of a)if(b.has(k))n++;return n;}
function jaccard(a:Set<string>,b:Set<string>){const n=intersection(a,b);return n/(a.size+b.size-n||1);}
function bodyText(a:ArticleIdentity){
 const parts=[text(a.intro)];
 // Content, not shared promos, affiliate, links, photos or source lists.
 if(Array.isArray(a.blocks))for(const raw of a.blocks.slice(0,250)){
  if(!raw||typeof raw!=="object")continue;
  const b=raw as Record<string,unknown>;
  if(["text","tip","warning","quote"].includes(text(b.type)))parts.push(text(b.content));
  else if(["h2","h3"].includes(text(b.type)))parts.push(text(b.text));
  else if(["bullet-list","numbered-list"].includes(text(b.type))&&Array.isArray(b.items))parts.push(...b.items.map(text));
  else if(b.type==="table"){
   if(Array.isArray(b.headers))parts.push(...b.headers.map(text));
   if(Array.isArray(b.rows))for(const row of b.rows)if(Array.isArray(row))parts.push(...row.map(text));
  }
 }
 parts.push(text(a.takeaway));return normalize(parts.join(" "));
}
function shingles(v:string){const w=words(v),out=new Set<string>();for(let i=0;i+4<=w.length;i++)out.add(w.slice(i,i+4).join(" "));return out;}
function signature(a:ArticleIdentity){
 const title=normalize(a.title),body=bodyText(a);
 return {title,keywords:keywords(title),excerpt:normalize(a.excerpt),body,bodyWords:words(body).length,shingles:shingles(body)};
}
function compare(a:ReturnType<typeof signature>,b:ReturnType<typeof signature>):Pick<Candidate,"reason"|"score">|null{
 if(a.bodyWords>=80&&b.bodyWords>=80){
  if(a.body===b.body)return {reason:"SAME_BODY",score:100};
  const common=intersection(a.shingles,b.shingles),similarity=jaccard(a.shingles,b.shingles);
  if(common>=50&&similarity>=0.65)return {reason:"SIMILAR_BODY",score:Math.round(similarity*100)};
 }
 if(a.title&&a.title===b.title)return {reason:"SAME_TITLE",score:100};
 const similarity=jaccard(a.keywords,b.keywords);
 if(a.keywords.size>=3&&b.keywords.size>=3&&intersection(a.keywords,b.keywords)>=3&&similarity>=0.72)
  return {reason:"SIMILAR_TITLE",score:Math.round(similarity*100)};
 return null;
}
export function compareArticleIdentity(a:ArticleIdentity,b:ArticleIdentity){
 if(a.id!==undefined&&a.id===b.id)return null;
 return compare(signature(a),signature(b));
}
type Row={id:number;title:string;status:string;excerpt:string;intro:string;takeaway:string;blocks_json:string|null;body_too_large:number};
function rowIdentity(row:Row):ArticleIdentity{
 const blocks=JSON.parse(row.blocks_json??"[]") as unknown;
 if(!Array.isArray(blocks))throw Error("ARTICLE_SIMILARITY_INVALID_BLOCKS");
 return {...row,blocks};
}
const select="SELECT id,title,status,excerpt,intro,takeaway,CASE WHEN length(blocks_json)<=120000 THEN blocks_json ELSE NULL END AS blocks_json,CASE WHEN length(blocks_json)>120000 THEN 1 ELSE 0 END AS body_too_large FROM managed_articles";
/** Keyset pagination keeps each D1 response bounded. No network or AI calls,
 * no content is returned in a report. Oversize/invalid articles are explicit
 * incomplete evidence, never silently reported as fully checked. */
export async function findSimilarArticles(db:D1Database,input:ArticleIdentity):Promise<ArticleSimilarityReport>{
 const wanted=signature(input),candidates:Candidate[]=[];
 let after=0,scanned=0,incomplete=false;
 while(scanned<MAX_ROWS){
  const limit=Math.min(20,MAX_ROWS-scanned);
  const res=await db.prepare(select+" WHERE id>? ORDER BY id LIMIT ?").bind(after,limit).all<Row>();
  if(!res.success||!Array.isArray(res.results))throw Error("ARTICLE_SIMILARITY_UNAVAILABLE");
  for(const row of res.results){
   after=row.id;scanned++;
   if(row.id===input.id)continue;
   let item:ArticleIdentity;
   try{item=rowIdentity(row);if(row.body_too_large)incomplete=true;}catch{incomplete=true;item={id:row.id,title:row.title};}
   const match=compare(wanted,signature(item));
   if(match)candidates.push({id:row.id,title:row.title,status:row.status,...match});
  }
  if(res.results.length<limit)break;
 }
 if(scanned>=MAX_ROWS&&await db.prepare("SELECT id FROM managed_articles WHERE id>? LIMIT 1").bind(after).first())incomplete=true;
 const rank=(c:Candidate)=>c.reason==="SAME_BODY"?0:c.reason==="SAME_TITLE"?1:c.reason==="SIMILAR_BODY"?2:3;
 candidates.sort((a,b)=>rank(a)-rank(b)||b.score-a.score||a.id-b.id);
 return {candidates:candidates.slice(0,10),scanned,incomplete};
}
export function strongArticleDuplicate(report:ArticleSimilarityReport){
 return report.candidates.find(c=>c.reason==="SAME_BODY"||c.reason==="SAME_TITLE"||c.reason==="SIMILAR_BODY");
}
