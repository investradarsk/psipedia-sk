"use client";

import { useEffect, useState } from "react";
import { dynamicUrlKinds, type DynamicUrlKind, type DynamicUrlPage } from "@/lib/visual-library-dynamic-urls-contract";
import styles from "./admin-visual-library.module.css";
import { AdminVisualLibraryHtmlCheck } from "@/components/admin-visual-library-html-check";

const ENDPOINT = "/api/admin/visual-library/urls";
type Request = { kind: DynamicUrlKind; q: string; page: number };

export function AdminVisualLibraryDynamicUrls({
  initialKind = "directory",
}: { initialKind?: DynamicUrlKind } = {}) {
  const [request, setRequest] = useState<Request>({kind:initialKind,q:"",page:1});
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<DynamicUrlPage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const kindInfo = dynamicUrlKinds.find(item => item.id === request.kind)!;

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      kind:request.kind, page:String(request.page), q:request.q,
    });
    fetch(ENDPOINT + "?" + params.toString(), {
      credentials:"same-origin", cache:"no-store", signal:controller.signal,
    }).then(async response => {
      const body = await response.json() as DynamicUrlPage & {error?:string};
      if (!response.ok || body.error) throw new Error(body.error || "Nepodarilo sa načítať URL.");
      return body;
    }).then(page => {
      if (controller.signal.aborted) return;
      setResult(page); setLoading(false); setError("");
    }).catch(e => {
      if (controller.signal.aborted) return;
      setResult(null); setLoading(false);
      setError(e instanceof Error ? e.message : "Nepodarilo sa načítať URL.");
    });
    return () => controller.abort();
  }, [request]);

  function requestPage(next: Request) {
    setLoading(true); setError(""); setRequest(next);
  }

  return (
    <section className={styles.dynamicInventory} aria-label="Konkrétne verejné URL dynamických profilov">
      <div className={styles.usageHead}>
        <div><h3>Všetky publikované dynamické URL</h3>
          <p>Presné odkazy z databázy. Stránkovanie umožňuje prejsť celý zoznam, nielen prvých niekoľko stoviek.</p>
        </div>
        <strong>{result && !loading ? result.total.toLocaleString("sk-SK") : "—"} URL</strong>
      </div>
      <div className={styles.dynamicInventoryControls}>
        <label>
          <span>Typ verejného záznamu</span>
          <select value={request.kind} onChange={event => {
            const kind = event.target.value as DynamicUrlKind;
            setSearch(""); requestPage({kind,page:1,q:""});
          }}>
            {dynamicUrlKinds.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <form onSubmit={e => {
          e.preventDefault(); requestPage({...request,q:search.trim().slice(0,100),page:1});
        }}>
          <label><span>Hľadať podľa názvu alebo URL</span>
            <input value={search} onChange={e => setSearch(e.target.value)}
              maxLength={100} placeholder="Napr. veterinár, Neo, Nitra" />
          </label>
          <button type="submit" disabled={loading}>Hľadať</button>
        </form>
      </div>
      <p className={styles.explanation}>
        Šablóna: <code>{kindInfo.template}</code>. Publikované URL sú v tomto zozname konkrétne,
        ale použitie určitého React komponentu na nich je iba možné, kým ho neoveríme.
      </p>
      {loading ? <p role="status">Načítavam publikované adresy…</p> : error ? (
        <p role="alert" className={styles.pending}>{error} Zoznam preto neoznačujeme ako kompletný.</p>
      ) : result ? <>
        <p className={styles.scanState}>
          {result.total === 0 ? "Žiadne publikované URL v tejto skupine alebo podľa filtra." :
            `Celkom ${result.total} URL, stránka ${result.page} z ${result.pages}.`}
          {" "}Stav k {new Date(result.generatedAt).toLocaleString("sk-SK", {timeZone:"Europe/Bratislava"})}.
        </p>
        <ul className={styles.usages}>
          {result.items.map(item => <li key={item.kind + ":" + item.id}>
            <div><strong>{item.label}</strong>
              {item.detail && <small>{item.detail}</small>}
              <code>{item.url}</code>
              <AdminVisualLibraryHtmlCheck key={item.kind + ":" + item.id + ":" + item.url}
                url={item.url} profileKind={item.kind} />
            </div>
            <a href={item.url} target="_blank" rel="noopener noreferrer">Otvoriť profil</a>
          </li>)}
        </ul>
        {result.pages > 1 && <div className={styles.dynamicInventoryPager}>
          <button type="button" disabled={result.page <= 1 || loading}
            onClick={() => requestPage({...request,page:1})}>Prvá</button>
          <button type="button" disabled={result.page <= 1 || loading}
            onClick={() => requestPage({...request,page:result.page-1})}>Predchádzajúca</button>
          <strong>{result.page} / {result.pages}</strong>
          <button type="button" disabled={result.page >= result.pages || loading}
            onClick={() => requestPage({...request,page:result.page+1})}>Ďalšia</button>
          <button type="button" disabled={result.page >= result.pages || loading}
            onClick={() => requestPage({...request,page:result.pages})}>Posledná</button>
        </div>}
      </> : null}
      <p className={styles.scanState}>
        „Overiť HTML stránky“ kontroluje vždy iba jednu presnú publikovanú URL
        a jej serverové HTML. Pri dostupnej unikátnej značke profilu potvrdí
        vykreslenie detailovej šablóny; pri ostatných profiloch iba načítanie
        stránky, nie použitie konkrétneho komponentu. Nekontroluje mobilný
        viewport ani komponenty vykreslené až JavaScriptom.
      </p>
      <p className={styles.nextStep}>Nie sú tu koncepty, súkromné kontakty ani odhadnuté slugy.
        Pri nedostupnej databáze alebo neplatnom publikovanom zázname sa zobrazí chyba,
        nie falošný úplný zoznam.</p>
    </section>
  );
}
