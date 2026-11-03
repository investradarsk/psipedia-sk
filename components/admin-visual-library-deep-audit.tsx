"use client";

import { useMemo, useState } from "react";
import type { CoverageRegistry } from "@/components/admin-visual-library-coverage";
import type {
  DeepVisualModule, ExactCssGroup, SourceMatchGroup, NearJsxCandidate,
} from "@/lib/visual-library-deep-audit-types";
import { publicRegistryRouteHref } from "@/lib/component-registry-route";
import styles from "./admin-visual-library.module.css";

type AuditView = "sources" | "code" | "structure" | "near" | "css" | "styles";
const PAGE_SIZE = 35;
const VIEWS: Array<{id:AuditView;label:string}> = [
  {id:"sources",label:"Všetky JSX zdroje"},
  {id:"code",label:"Totožné zdrojové súbory"},
  {id:"structure",label:"Rovnaká JSX štruktúra"},
  {id:"near",label:"Veľmi podobné JSX"},
  {id:"css",label:"Opakované CSS deklarácie"},
  {id:"styles",label:"Všetky CSS súbory"},
];

const githubFile = (file:string,line?:number) =>
  "https://github.com/investradarsk/psipedia-sk/blob/main/" + file +
    (line ? "#L" + line : "");

function SourceFiles({files, modules}: {
  files:readonly string[];modules:ReadonlyMap<string,DeepVisualModule>;
}) {
  return <ul className={styles.deepAuditFiles}>
    {files.map(file => {
      const sourceEntry = modules.get(file);
      const routes = sourceEntry?.routes ?? [];
      return <li key={file}>
        <a href={githubFile(file)} target="_blank" rel="noopener noreferrer">
          <code>{file}</code>
        </a>
        {sourceEntry && <small>{sourceEntry.jsxElements} JSX prvkov · {routes.length}
          {" "}možných stránkových šablón</small>}
        {routes.length > 0 && <small>{routes.slice(0,5).join(", ")}
          {routes.length > 5 ? " …" : ""}</small>}
      </li>;
    })}
  </ul>;
}

function SourceGroup({group, modules}: {
  group:SourceMatchGroup;modules:ReadonlyMap<string,DeepVisualModule>;
}) {
  return <details className={styles.deepAuditFinding}>
    <summary>
      <strong>{group.kind==="identical-file"?"Presná zhoda zdrojového textu":"Zhodná JSX štruktúra"}</strong>
      <span>{group.count} súborov</span>
      <small>{group.files.slice(0,2).map(f=>f.split("/").pop()).join(" × ")}</small>
    </summary>
    <div className={styles.deepAuditDetail}>
      <p>{group.kind==="identical-file"
        ? "Bajty zdrojových súborov sú totožné. Nemusí ísť o duplicitne vykreslený komponent, pokiaľ sa nepoužívajú rovnakým spôsobom."
        : "Poradie JSX značiek a názvov atribútov je rovnaké (hodnoty textov a props nie sú porovnané). Je to kandidát na vizuálne preverenie, nie potvrdená duplicita."}
      </p>
      <SourceFiles files={group.files} modules={modules}/>
    </div>
  </details>;
}


function NearGroup({pair,modules}:{
  pair:NearJsxCandidate;modules:ReadonlyMap<string,DeepVisualModule>;
}){
  const paths=[pair.leftPath,pair.rightPath];
  return <details className={styles.deepAuditFinding}>
    <summary>
      <strong>{pair.score} % podobnosť JSX značiek a atribútov</strong>
      <span>{pair.sharedTags} spoločných značiek</span>
      <small>{paths.map(p=>p.split("/").pop()).join(" × ")}</small>
    </summary>
    <div className={styles.deepAuditDetail}>
      <p>Veľmi podobné počty a názvy JSX značiek či atribútov podľa AST.
        Poradie vnorenia, hodnoty textov, CSS a viditeľný výsledok môžu byť
        odlišné. Vyžaduje ručné porovnanie, nie automatické zlúčenie.</p>
      <SourceFiles files={paths} modules={modules}/>
    </div>
  </details>;
}

function CssGroup({group}: {group:ExactCssGroup}) {
  return <details className={styles.deepAuditFinding}>
    <summary>
      <strong>{group.propertyCount} totožných CSS vlastností</strong>
      <span>{group.filesCount} CSS súborov · {group.members.length} pravidiel</span>
      <small>{group.members.slice(0,2).map(m=>m.selector).join(" / ")}</small>
    </summary>
    <div className={styles.deepAuditDetail}>
      <p>Presná zhoda množiny deklarácií
        {group.context ? " v rovnakom kontexte "+group.context : " bez @media kontextu"}.
        Nepotvrdzuje rovnakú špecificitu, CSS kaskádu ani výsledný vzhľad.</p>
      <div className={styles.deepAuditDeclarations}>
        {group.declarations.map((decl,i)=><code key={i}>{decl};</code>)}
      </div>
      <ul className={styles.deepAuditFiles}>
        {group.members.map((m,i)=><li key={m.file+":"+m.line+":"+i}>
          <a href={githubFile(m.file,m.line)} target="_blank" rel="noopener noreferrer">
            <code>{m.file}:{m.line}</code>
          </a>
          <small>Selektor: {m.selector}</small>
        </li>)}
      </ul>
    </div>
  </details>;
}

export function AdminVisualLibraryDeepAudit({
  registry, initialView="sources",
}: {
  registry:CoverageRegistry;initialView?:AuditView;
}) {
  const [view,setView] = useState<AuditView>(initialView);
  const [query,setQuery] = useState("");
  const [role,setRole] = useState("all");
  const [limit,setLimit] = useState(PAGE_SIZE);
  const audit = registry.deepAudit;
  const modules = useMemo(
    ()=>new Map((audit?.modules??[]).map(item=>[item.path,item])),
    [audit],
  );
  if(!audit)return <section className={styles.deepAudit} aria-label="Úplný inventár">
    <p className={styles.pending}>Táto zostava ešte neobsahuje rozšírený zdrojový
      audit. Pri nasadení musí prebehnúť generovanie registra komponentov.</p>
  </section>;

  const totals = audit.totals;
  const search=query.trim().toLocaleLowerCase("sk");
  const filter = (value:string) => !search||value.toLocaleLowerCase("sk").includes(search);
  const sourceRows = audit.modules.filter(m=>
    (role==="all"||role===m.role||(role==="noncomponent"&&!m.registered))
    &&filter([m.path,m.role,...m.routes].join(" ")));
  const sameRows=audit.identicalSourceGroups.filter(g=>
    filter(g.files.join(" ")));
  const structureRows=audit.similarStructureGroups.filter(g=>
    filter(g.files.join(" ")));
  const nearRows=audit.nearJsxCandidates.filter(pair=>
    filter([pair.leftPath,pair.rightPath,String(pair.score)].join(" ")));
  const cssRows=audit.exactCssDeclarationGroups.filter(g=>
    filter([g.context,...g.declarations,...g.members.flatMap(m=>[m.file,m.selector])].join(" ")));
  const styleRows=audit.cssFiles.filter(s=>filter(s.path));
  const count = view==="sources"?sourceRows.length:
    view==="code"?sameRows.length:view==="structure"?structureRows.length:
      view==="near"?nearRows.length:
      view==="css"?cssRows.length:styleRows.length;
  const visibleCount=Math.min(limit,count);

  const changeView=(next:AuditView)=>{
    setView(next);setLimit(PAGE_SIZE);setQuery("");setRole("all");
  };

  return <section className={styles.deepAudit} aria-label="Úplný inventár a zdrojové duplicity">
    <header>
      <h3>Úplný zdrojový inventár a podobnosti</h3>
      <p>Kontrolujeme všetky nájdené JSX súbory v aplikácii vrátane prvkov
        napísaných priamo v stránkach a layoutoch. CSS prechádzame v celom
        sledovanom zdrojovom strome. Nič sa automaticky nezlučuje ani nemaže.</p>
    </header>
    <div className={styles.deepAuditStats}>
      <div><strong>{totals.jsxFiles}</strong><span>JSX súborov s vizuálnym obsahom</span></div>
      <div><strong>{totals.otherJsxFiles}</strong><span>Mimo pôvodného registra</span></div>
      <div><strong>{totals.cssFiles}</strong><span>CSS súborov</span></div>
      <div><strong>{totals.exactCssGroups}</strong><span>Skupín zhodných CSS deklarácií</span></div>
    </div>
    <p className={styles.explanation}>Zdrojová zhoda je spoľahlivá iba v danom rozsahu:
      rovnaké bajty, rovnaká JSX kostra alebo rovnaká skupina CSS deklarácií.
      Žiadna z nich sama osebe nedokazuje dva totožné viditeľné prvky na webe.
      Neindexujeme obsah z databázy ani runtime DOM.</p>

    <nav className={styles.deepAuditTabs} aria-label="Typy auditu">
      {VIEWS.map(item=><button type="button" key={item.id}
        aria-pressed={view===item.id} onClick={()=>changeView(item.id)}>
        {item.label} <small>{item.id==="sources"?audit.modules.length:
          item.id==="code"?audit.identicalSourceGroups.length:
            item.id==="structure"?audit.similarStructureGroups.length:
            item.id==="near"?audit.nearJsxCandidates.length:
              item.id==="css"?audit.exactCssDeclarationGroups.length:audit.cssFiles.length}</small>
      </button>)}
    </nav>
    <div className={styles.deepAuditFilters}>
      <label>
        <span>Hľadať súbor, selektor, CSS alebo stránku</span>
        <input type="search" value={query} onChange={e=>{setQuery(e.target.value);setLimit(PAGE_SIZE);}}
          placeholder="Napr. hero, .card, /adresar, display:flex"/>
      </label>
      {view==="sources"&&<label>
        <span>Typ JSX zdroja</span>
        <select value={role} onChange={e=>{setRole(e.target.value);setLimit(PAGE_SIZE);}}>
          <option value="all">Všetky druhy</option>
          <option value="noncomponent">Mimo pôvodného registra</option>
          <option value="component">Samostatné komponenty</option>
          <option value="page">Stránky</option>
          <option value="layout">Layouty</option>
          <option value="route-shell">Načítanie / chyby / šablóny</option>
          <option value="app-module">Ďalšie súbory aplikácie</option>
          <option value="lib-jsx">JSX v knižnici</option>
        </select>
      </label>}
    </div>
    <div className={styles.usageHead}>
      <div><h4>Nájdené: {count}</h4><p>Zobrazených {visibleCount} z {count}.
        Kompletný výsledok možno postupne rozbaliť.</p></div>
      <strong>Audit zdrojového kódu</strong>
    </div>
    <div className={styles.deepAuditResults}>
      {view==="sources"&&sourceRows.slice(0,limit).map(item=>
        <article className={styles.deepAuditSource} key={item.path}>
          <div>
            <strong>{item.path.split("/").pop()}</strong>
            <small>{item.role} · {item.jsxElements} JSX prvkov ·
              {item.registered?" pôvodný register":" doplnený zdroj"}</small>
            <code>{item.path}</code>
            {item.routes.length>0&&<small>Možné šablóny: {item.routes.slice(0,7).join(", ")}
              {item.routes.length>7?" …":""}</small>}
            {item.routes.filter(r=>publicRegistryRouteHref(r)).length>0&&
              <small>Verejné statické URL sú kandidátske, nie potvrdené DOM výskyty.</small>}
          </div>
          <a href={githubFile(item.path)} target="_blank" rel="noopener noreferrer">Zdroj</a>
        </article>)}
      {view==="code"&&sameRows.slice(0,limit).map(g=>
        <SourceGroup key={g.id} group={g} modules={modules}/>)}
      {view==="structure"&&structureRows.slice(0,limit).map(g=>
        <SourceGroup key={g.id} group={g} modules={modules}/>)}
      {view==="near"&&nearRows.slice(0,limit).map(pair=>
        <NearGroup key={pair.leftPath+"|"+pair.rightPath} pair={pair} modules={modules}/>)}
      {view==="css"&&cssRows.slice(0,limit).map(g=>
        <CssGroup key={g.id} group={g}/>)}
      {view==="styles"&&styleRows.slice(0,limit).map(item=>
        <article className={styles.deepAuditSource} key={item.path}>
          <div><strong>{item.path.split("/").pop()}</strong>
            <small>{item.rules} CSS pravidiel</small><code>{item.path}</code>
          </div>
          <a href={githubFile(item.path)} target="_blank" rel="noopener noreferrer">Zdroj</a>
        </article>)}
      {count===0&&<p className={styles.pending}>Pre zadané filtre nie sú výsledky.
        Pri zhodách to môže znamenať aj to, že v kóde nie sú presné kópie.</p>}
    </div>
    {count>limit&&<button className={styles.moreButton} type="button"
      onClick={()=>setLimit(n=>n+PAGE_SIZE)}>Zobraziť ďalšie ({count-limit})</button>}
    <p className={styles.nextStep}>Toto je statický audit zdrojových súborov
      zostavených pri builde. Dynamické importy, podmienené vykreslenie,
      konečná CSS kaskáda a skutočná vizuálna zhoda na konkrétnej URL
      sa musia overiť samostatne.</p>
  </section>;
}
