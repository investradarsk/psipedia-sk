"use client";

import { useState, useSyncExternalStore } from "react";
import { PublicChoiceInput } from "@/components/public-visual-system/public-form-controls";
import { PUPPY_EQUIPMENT_GROUPS, PUPPY_EQUIPMENT_STORAGE_KEY, parsePuppyEquipmentProgress, puppyEquipmentProgress } from "@/lib/puppy-equipment";
import styles from "./puppy-equipment.module.css";

const CHANGE_EVENT = "psipedia-puppy-equipment-changed";
const subscribe = (notify: () => void) => {
  const storage = (event: StorageEvent) => { if (event.key === PUPPY_EQUIPMENT_STORAGE_KEY || event.key === null) notify(); };
  window.addEventListener("storage", storage);
  window.addEventListener(CHANGE_EVENT, notify);
  return () => { window.removeEventListener("storage", storage); window.removeEventListener(CHANGE_EVENT, notify); };
};
function snapshot(): string | null {
  try { return window.localStorage.getItem(PUPPY_EQUIPMENT_STORAGE_KEY) ?? "[]"; } catch { return null; }
}
const serverSnapshot = () => undefined;
const hydrateSubscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function PuppyEquipmentChecklist() {
  const ready = useSyncExternalStore(hydrateSubscribe, clientReady, serverReady);
  const raw = useSyncExternalStore<string | null | undefined>(subscribe, snapshot, serverSnapshot);
  const [session, setSession] = useState<string[] | null>(null);
  const [remainingOnly, setRemainingOnly] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const ids = session ?? parsePuppyEquipmentProgress(raw);
  const checked = new Set(ids);
  const progress = puppyEquipmentProgress(ids);
  function save(next: string[]) {
    try {
      window.localStorage.setItem(PUPPY_EQUIPMENT_STORAGE_KEY, JSON.stringify(next));
      setSession(null);
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch { setSession(next); }
  }
  function toggle(id: string) {
    const latest = new Set(session ?? parsePuppyEquipmentProgress(snapshot()));
    if (latest.has(id)) latest.delete(id); else latest.add(id);
    save([...latest]);
  }
  return <section className={styles.checklist} aria-label="Zoznam výbavy" data-puppy-equipment>
    <div className={styles.summary}>
      <div className={styles.summaryTop}>
        <div><h2>Tvoja pripravenosť</h2><p role="status" aria-live="polite">{progress.done} z {progress.total} základných položiek pripravených · {progress.allDone} z {progress.allTotal} celkovo</p></div>
        <strong>{progress.percent} %</strong>
      </div>
      <progress className={styles.progress} max={progress.total} value={progress.done} aria-label="Pripravenosť základnej výbavy" />
      <p className={styles.note}>{ready && (session !== null || raw === null) ? "Ukladanie v prehliadači nie je dostupné. Zmeny zostanú iba počas tejto návštevy." : "Zoznam sa ukladá v tomto prehliadači. Bez registrácie; neprenáša sa medzi zariadeniami."}</p>
      <div className={styles.controls}>
        <label className={styles.filter}><PublicChoiceInput checked={remainingOnly} disabled={!ready} onChange={event => setRemainingOnly(event.target.checked)} /> Len nepripravené</label>
        <button className={styles.secondary} type="button" disabled={!ready || !ids.length} onClick={() => setConfirmReset(true)}>Vynulovať zoznam</button>
      </div>
      {confirmReset && <div className={styles.confirm} role="group" aria-label="Potvrdenie vynulovania"><p>Odstrániť všetky zaškrtnutia?</p><button type="button" className={styles.secondary} onClick={() => { save([]); setConfirmReset(false); }}>Áno, vynulovať</button><button type="button" className={styles.secondary} onClick={() => setConfirmReset(false)}>Zrušiť</button></div>}
    </div>
    <noscript><p>Na odškrtávanie a ukladanie zoznamu je potrebný JavaScript. Položky si môžeš prečítať aj bez neho.</p></noscript>
    <div className={styles.groups}>
      {PUPPY_EQUIPMENT_GROUPS.map(group => {
        const visible = group.items.filter(item => !remainingOnly || !checked.has(item.id));
        return <section className={styles.group} key={group.id} aria-labelledby={"equipment-" + group.id}>
          <div className={styles.groupHeading}><h3 id={"equipment-" + group.id}>{group.title}</h3><span>{group.items.filter(item => checked.has(item.id)).length}/{group.items.length}</span></div>
          {visible.length ? <ul>{visible.map(item => <li key={item.id}>
            <label className={styles.item} data-checked={checked.has(item.id)}>
              <PublicChoiceInput checked={checked.has(item.id)} disabled={!ready} onChange={() => toggle(item.id)} />
              <span><strong>{item.title}</strong>{item.optional && <span className={styles.optional}>Voliteľné</span>}<small>{item.hint}</small></span>
            </label>
          </li>)}</ul> : <p className={styles.note}>Všetko pripravené.</p>}
        </section>;
      })}
    </div>
    {progress.done === progress.total && <p className={styles.complete} role="status">Základnú výbavu máš pripravenú. Prispôsob ju potrebám svojho šteniatka.</p>}
  </section>;
}
