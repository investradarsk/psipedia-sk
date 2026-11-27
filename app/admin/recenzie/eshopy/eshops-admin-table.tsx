"use client";

import Link from "next/link";
import { useState } from "react";
import { AdminRecordTable } from "@/components/admin-record-table";
import { AdminEshopListInline } from "@/components/admin-eshop-list-inline";
import { ESHOP_RATING_FIELDS } from "@/lib/eshop-rating-domain";
import type { ManagedEshop } from "@/lib/eshop-ratings";
import styles from "./eshops-admin.module.css";

function format(value: number) {
  return new Intl.NumberFormat("sk-SK", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}
const statusLabel = { published: "Publikované", archived: "Archivované", draft: "Koncept" } as const;

export function AdminEshopTable({ shops }: { shops: ManagedEshop[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ManagedEshop["status"] | "all">("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const shop = shops.find(item => item.id === selectedId);
  const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("sk").trim();
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const visible = shops.filter(item => (status === "all" || item.status === status) &&
    terms.every(term => normalize([item.id, item.name, item.websiteUrl, ...item.focusTags].join(" ")).includes(term)));
  return <>
    <fieldset role="search" aria-label="Filtrovať e-shopy" data-admin-list-filters data-admin-list-layout="simple" disabled={editing}>
      <legend className="sr-only">Vyhľadávanie a filtre e-shopov</legend>
      <label data-admin-list-search><span>Hľadať</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Názov, Admin ID, web alebo zameranie" /></label>
      <label><span>Stav</span><select value={status} onChange={event => setStatus(event.target.value as typeof status)}>
        <option value="all">Všetky stavy</option>
        {Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <div data-admin-list-filter-actions><button className="admin-secondary-action" type="button" onClick={() => { setQuery(""); setStatus("all"); }}>Vyčistiť filtre</button></div>
    </fieldset>
    <p role="status" data-admin-list-results>Nájdené: {visible.length} z {shops.length}</p>
    {visible.length ? <AdminRecordTable
      rows={visible}
      label="E-shopy"
      density="compact"
      stretch
      stickyActions
      rowDataAttribute="data-admin-eshop-row"
      columns={[
        { id: "photo", label: "Logo", width: 62, cell: item => <span className={styles.tableLogo}>{item.logoUrl ? <img src={item.logoUrl} alt="" /> : "—"}</span> },
        { id: "name", label: "Názov", width: 240, sortValue: item => item.name, cell: item => <Link href={`/admin/recenzie/eshopy/${item.id}`}>{item.name}</Link> },
        { id: "status", label: "Publikácia", width: 132, sortValue: item => item.status, cell: item => <span className={"admin-status admin-status--" + item.status}>{statusLabel[item.status]}</span> },
        { id: "focus", label: "Zameranie", width: 220, cell: item => <span title={item.focusTags.join(", ")}>{item.focusTags.join(", ") || "—"}</span> },
        { id: "rating", label: "Hodnotenie", width: 120, sortValue: item => item.averages?.overall ?? -1, cell: item => item.averages ? format(item.averages.overall) + " ★" : "—" },
        { id: "ratingCount", label: "Počet hodnotení", width: 135, sortValue: item => item.ratingCount, cell: item => item.ratingCount },
        { id: "actions", label: "Akcie", width: 260, cell: item => <div className={styles.tableActions}>
          <Link href={`/admin/recenzie/eshopy/${item.id}`}>Upraviť</Link>
          {item.status === "published" && <Link href={`/recenzie/eshopy/${item.slug}`} target="_blank" rel="noreferrer">Verejný profil ↗</Link>}
          <button type="button" disabled={editing} aria-expanded={selectedId === item.id} aria-controls={selectedId === item.id && shop ? "eshop-list-detail" : undefined} onClick={() => setSelectedId(item.id)}>Detail a rýchla úprava</button>
        </div> },
      ]}
    /> : <p className={styles.empty}>{shops.length ? "Žiadny e-shop nezodpovedá filtrom." : "E-shopy sa momentálne nepodarilo načítať."}</p>}
    {shop && <section id="eshop-list-detail" className={styles.detail} aria-label={`Detail e-shopu ${shop.name}`}>
      <div className={styles.detailHeader}>
        <strong>{shop.name} · ID {shop.id}</strong>
        <button type="button" className="admin-secondary-action" disabled={editing} onClick={() => setSelectedId(null)}>Zavrieť detail</button>
      </div>
      <div className={styles.card}>
        <div className={styles.logo}>{shop.logoUrl ? <img src={shop.logoUrl} alt="" /> : <span>LOGO</span>}</div>
        <div className={styles.main}>
          <AdminEshopListInline key={shop.id} shop={shop} onEditingChange={setEditing} />
          <p>{shop.description}</p>
          {shop.focusTags.length > 0 && <div className={styles.tags}>{shop.focusTags.map(tag => <span key={tag}>{tag}</span>)}</div>}
          <div className={styles.links}>
            <a href={shop.websiteUrl} target="_blank" rel="noreferrer">Web e-shopu ↗</a>
            <a href={shop.sourceUrl} target="_blank" rel="noreferrer">Zdroj profilu ↗</a>
            {shop.status === "published" && <Link href={`/recenzie/eshopy/${shop.slug}`} target="_blank">Profil Psipedia ↗</Link>}
            <Link className={styles.editLink} href={`/admin/recenzie/eshopy/${shop.id}`}>Upraviť profil</Link>
          </div>
        </div>
        <div className={styles.rating}>
          {shop.averages ? <>
            <strong>{format(shop.averages.overall)} ★</strong>
            <span>{shop.ratingCount} hodnotení</span>
            <dl>{ESHOP_RATING_FIELDS.slice(0, 4).map(field => <div key={field.key}><dt>{field.label}</dt><dd>{format(shop.averages?.[field.key] ?? 0)}</dd></div>)}</dl>
          </> : <><strong>—</strong><span>Zatiaľ bez hodnotení</span></>}
        </div>
      </div>
    </section>}
  </>;
}
