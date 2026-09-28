"use client";

import type { ArticleSeo } from "@/lib/content";

export function AdminSeoFields({ value, onChange, canonicalPath, fallbackTitle, fallbackDescription }: {
  value: ArticleSeo;
  onChange: (value: ArticleSeo) => void;
  canonicalPath: string;
  fallbackTitle: string;
  fallbackDescription: string;
}) {
  const set = (key: keyof ArticleSeo, next: string | boolean) => onChange({ ...value, [key]: next });
  return <section className="admin-form-card admin-seo-card">
    <div className="admin-card-heading"><div><span>SEO</span><div><h2>SEO a zdieľanie</h2><p>Polia sú nepovinné. Prázdne hodnoty sa automaticky doplnia z profilu.</p></div></div></div>
    <div className="admin-field-grid">
      <label className="admin-field"><span>SEO title</span><input value={value.title ?? ""} onChange={(e)=>set("title",e.target.value)} placeholder={fallbackTitle}/></label>
      <label className="admin-field"><span>Hlavné kľúčové slovo / fráza</span><input value={value.focusKeyword ?? ""} onChange={(e)=>set("focusKeyword",e.target.value)} /></label>
    </div>
    <label className="admin-field"><span>Meta description</span><textarea rows={3} value={value.description ?? ""} onChange={(e)=>set("description",e.target.value)} placeholder={fallbackDescription}/></label>
    <label className="admin-field"><span>Canonical URL</span><input value={value.canonicalUrl ?? ""} onChange={(e)=>set("canonicalUrl",e.target.value)} placeholder={`https://psipedia.sk${canonicalPath}`}/></label>
    <div className="admin-field-grid">
      <label className="admin-field"><span>Open Graph title</span><input value={value.ogTitle ?? ""} onChange={(e)=>set("ogTitle",e.target.value)} placeholder={value.title || fallbackTitle}/></label>
      <label className="admin-field"><span>Open Graph obrázok</span><input value={value.ogImage ?? ""} onChange={(e)=>set("ogImage",e.target.value)} placeholder="/media/... alebo https://…"/></label>
    </div>
    <label className="admin-field"><span>Open Graph description</span><textarea rows={3} value={value.ogDescription ?? ""} onChange={(e)=>set("ogDescription",e.target.value)} placeholder={value.description || fallbackDescription}/></label>
    <label className="admin-event-cancelled"><input type="checkbox" checked={Boolean(value.noindex)} onChange={(e)=>set("noindex",e.target.checked)}/><span><strong>Neindexovať profil (noindex)</strong><small>Vyhľadávače stránku neindexujú a sitemap ju vynechá.</small></span></label>
  </section>;
}
