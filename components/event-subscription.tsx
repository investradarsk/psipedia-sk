"use client";
import { useState } from "react";
import { CalendarPlus } from "lucide-react";
import { PublicActionButton } from "@/components/public-visual-system";
import { PublicSelect, PublicTextInput } from "@/components/public-visual-system/public-form-controls";
import { eventTypes, slovakRegions } from "@/lib/events";
import { eventSubscriptionUrl, type EventSubscriptionFilters } from "@/lib/event-subscription";
import styles from "./event-subscription.module.css";

export function EventSubscription({initialType="Všetky",initialRegion=""}:{initialType?:EventSubscriptionFilters["type"];initialRegion?:EventSubscriptionFilters["region"]}){
  const [type,setType]=useState(initialType),[region,setRegion]=useState(initialRegion);
  const [message,setMessage]=useState("");
  const url=eventSubscriptionUrl({type,region});
  const webcal=url.replace(/^https:/,"webcal:");
  const google="https://calendar.google.com/calendar/r?cid="+encodeURIComponent(webcal);
  async function copy(){
    try{await navigator.clipboard.writeText(url);setMessage("Adresa odberu skopírovaná.");}
    catch{setMessage("Skopíruj adresu ručne z poľa nižšie.");}
  }
  return <section className={styles.panel} data-event-subscription aria-labelledby="event-subscription-heading">
    <h2 id="event-subscription-heading"><CalendarPlus size={20} aria-hidden="true"/> Odber podujatí</h2>
    <p>Pridaj si vybrané kynologické podujatia do svojho kalendára. Nové termíny a zmeny sa prejavia pri ďalšom obnovení odberu.</p>
    <div className={styles.fields}>
      <label>Kraj odberu<PublicSelect value={region} onChange={e=>{setRegion(e.target.value as EventSubscriptionFilters["region"]);setMessage("");}}><option value="">Všetky kraje</option>{slovakRegions.map(r=><option key={r} value={r}>{r}</option>)}</PublicSelect></label>
      <label>Typ podujatia v odbere<PublicSelect value={type} onChange={e=>{setType(e.target.value as EventSubscriptionFilters["type"]);setMessage("");}}><option value="Všetky">Všetky typy</option>{eventTypes.map(t=><option key={t} value={t}>{t}</option>)}</PublicSelect></label>
    </div>
    <label className={styles.address}>Adresa odberu<PublicTextInput readOnly value={url} onFocus={e=>e.target.select()}/></label>
    <div className={styles.actions}><PublicActionButton onClick={copy}>Kopírovať adresu</PublicActionButton><a href={google} target="_blank" rel="noopener noreferrer">Google Kalendár ↗</a><a href={webcal}>Apple / iný kalendár</a></div>
    {message&&<p role="status">{message}</p>}
    <details><summary>Ako pridať odber</summary><p>Google Kalendár na počítači: Iné kalendáre → Z adresy URL. V Apple Kalendári vyber Nový odber kalendára. V Outlooku vyber Pridať kalendár → Prihlásiť sa na odber z webu. Vlož skopírovanú HTTPS adresu.</p><p>Neimportuj súbor ako jednorazovú udalosť, ak chceš aktualizácie. Interval obnovenia určuje tvoja aplikácia. Pri zmene filtra nahraď pôvodný odber novým.</p></details>
    <p className={styles.note}>Bez registrácie. Odber obsahuje dátumy podujatí (celodenné záznamy), zverejnené časy sú v popise. Zahŕňa približne dva roky dopredu a posledných 30 dní; zrušené publikované podujatia sú označené. Pred cestou si over detail podujatia.</p>
  </section>;
}
