"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ManagedEshop } from "@/lib/eshop-ratings";
import { AdminInlineCellInput, AdminInlineRowActions } from "@/components/admin-inline-edit-controls";
import styles from "./admin-eshop-list-inline.module.css";

/** Only identity text and website URL: never copy the full e-shop profile into
 * an inline mutation. The Lexical description stays in its canonical editor. */
export function AdminEshopListInline({ shop }: { shop: ManagedEshop }) {
  const router = useRouter();
  const [saved, setSaved] = useState({ name: shop.name, websiteUrl: shop.websiteUrl, updatedAt: shop.updatedAt });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(shop.name);
  const [websiteUrl, setWebsiteUrl] = useState(shop.websiteUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function cancel() {
    if (busy) return;
    setName(saved.name);
    setWebsiteUrl(saved.websiteUrl);
    setError("");
    setEditing(false);
  }
  function begin() {
    setName(saved.name);
    setWebsiteUrl(saved.websiteUrl);
    setNotice("");
    setError("");
    setEditing(true);
  }
  async function save() {
    if (busy || !editing) return;
    if (!name.trim() || !websiteUrl.trim()) {
      setError("Vyplň názov a web e-shopu.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/eshops/" + shop.id, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), websiteUrl: websiteUrl.trim(), expectedUpdatedAt: saved.updatedAt }),
      });
      const body = await response.json() as { shop?: ManagedEshop; error?: string };
      if (!response.ok || !body.shop) throw new Error(body.error || "Úprava e-shopu zlyhala.");
      setSaved({ name: body.shop.name, websiteUrl: body.shop.websiteUrl, updatedAt: body.shop.updatedAt });
      setName(body.shop.name);
      setWebsiteUrl(body.shop.websiteUrl);
      setEditing(false);
      setNotice("Názov a web boli uložené.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Úprava e-shopu zlyhala.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <div className={styles.heading}>
      <h2>{saved.name}</h2>
      <div className={styles.desktopOnly}>
        <AdminInlineRowActions editing={editing} busy={busy}
          onEdit={begin} onCancel={cancel} onSave={() => void save()} />
      </div>
    </div>
    {editing && <div className={styles.desktopOnly}>
      <div className={styles.fields}>
        <label>
          <span>Názov e-shopu</span>
          <AdminInlineCellInput label="Názov e-shopu" value={name} onChange={setName}
            maxLength={160} disabled={busy} required />
        </label>
        <label>
          <span>Web e-shopu</span>
          <input type="url" value={websiteUrl} maxLength={800}
            aria-label="Web e-shopu" required disabled={busy}
            onChange={event => setWebsiteUrl(event.target.value)} />
        </label>
      </div>
      <p className={styles.hint}>Popis, logo, adresu profilu a publikovanie upravuj v plnom editore.</p>
    </div>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {notice && <p role="status" className={styles.success}>{notice}</p>}
  </>;
}
