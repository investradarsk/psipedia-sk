"use client";

import { useMemo, useState } from "react";
import { defaultNavigationItems, type NavigationItem } from "@/lib/navigation";

function makeId() {
  return `menu-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizePositions(items: NavigationItem[]) {
  return items.map((item, position) => ({ ...item, position }));
}

export function AdminNavigationEditor({ initialItems }: { initialItems: NavigationItem[] }) {
  const [items, setItems] = useState(() => normalizePositions(initialItems));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const roots = useMemo(() => items.filter((item) => !item.parentId), [items]);

  function updateItem(id: string, patch: Partial<NavigationItem>) {
    setItems((current) => normalizePositions(current.map((item) => item.id === id ? { ...item, ...patch } : item)));
    setMessage("");
  }

  function addItem(parentId: string | null = null) {
    setItems((current) => normalizePositions([...current, { id: makeId(), label: parentId ? "Nová položka podmenu" : "Nová položka", href: "/", parentId, position: current.length, visible: true }]));
    setMessage("");
  }

  function removeItem(id: string) {
    const item = items.find((candidate) => candidate.id === id);
    if (!item || !window.confirm(`Odstrániť položku „${item.label}“${item.parentId ? "" : " aj s jej podmenu"}?`)) return;
    setItems((current) => normalizePositions(current.filter((candidate) => candidate.id !== id && candidate.parentId !== id)));
    setMessage("");
  }

  function moveItem(id: string, direction: -1 | 1) {
    setItems((current) => {
      const item = current.find((candidate) => candidate.id === id);
      if (!item) return current;
      const siblings = current.filter((candidate) => candidate.parentId === item.parentId);
      const target = siblings[siblings.findIndex((candidate) => candidate.id === id) + direction];
      if (!target) return current;
      const next = [...current];
      const from = next.findIndex((candidate) => candidate.id === id);
      const to = next.findIndex((candidate) => candidate.id === target.id);
      [next[from], next[to]] = [next[to], next[from]];
      return normalizePositions(next);
    });
    setMessage("");
  }

  function dropOn(targetId: string) {
    if (!draggedId || draggedId === targetId) return setDraggedId(null);
    setItems((current) => {
      const dragged = current.find((item) => item.id === draggedId);
      const target = current.find((item) => item.id === targetId);
      if (!dragged || !target || dragged.parentId !== target.parentId) return current;
      const next = current.filter((item) => item.id !== draggedId);
      next.splice(next.findIndex((item) => item.id === targetId), 0, dragged);
      return normalizePositions(next);
    });
    setDraggedId(null);
    setMessage("");
  }

  function changeParent(id: string, parentId: string | null) {
    setItems((current) => {
      if (parentId && current.some((item) => item.parentId === id)) return current;
      return normalizePositions(current.map((item) => item.id === id ? { ...item, parentId } : item));
    });
    setMessage("");
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/navigation", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ items }) });
      const result = await response.json() as { items?: NavigationItem[]; error?: string };
      if (!response.ok || !result.items) throw new Error(result.error || "Navigáciu sa nepodarilo uložiť.");
      setItems(normalizePositions(result.items));
      setMessage("Navigácia je uložená a zobrazuje sa na celom webe.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Navigáciu sa nepodarilo uložiť.");
    } finally {
      setSaving(false);
    }
  }

  function renderRow(item: NavigationItem) {
    const siblings = items.filter((candidate) => candidate.parentId === item.parentId);
    const index = siblings.findIndex((candidate) => candidate.id === item.id);
    const hasChildren = items.some((candidate) => candidate.parentId === item.id);
    return (
      <div className={`admin-navigation-row${item.parentId ? " is-child" : ""}${draggedId === item.id ? " is-dragging" : ""}`} draggable key={item.id}
        onDragStart={() => setDraggedId(item.id)} onDragEnd={() => setDraggedId(null)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropOn(item.id)}>
        <span className="admin-navigation-handle" title="Potiahni na zmenu poradia" aria-hidden="true">⋮⋮</span>
        <div className="admin-navigation-fields">
          <label>Názov<input value={item.label} onChange={(event) => updateItem(item.id, { label: event.target.value })} /></label>
          <label>Adresa<input value={item.href} onChange={(event) => updateItem(item.id, { href: event.target.value })} placeholder="/sekcia" /></label>
          <label>Umiestnenie<select value={item.parentId ?? ""} disabled={hasChildren} onChange={(event) => changeParent(item.id, event.target.value || null)}>
            <option value="">Hlavné menu</option>
            {roots.filter((root) => root.id !== item.id).map((root) => <option value={root.id} key={root.id}>Pod: {root.label}</option>)}
          </select></label>
        </div>
        <div className="admin-navigation-actions">
          <button type="button" className={item.visible ? "is-visible" : ""} onClick={() => updateItem(item.id, { visible: !item.visible })}>{item.visible ? "Zobrazené" : "Skryté"}</button>
          <button type="button" onClick={() => moveItem(item.id, -1)} disabled={index === 0} aria-label={`Posunúť ${item.label} vyššie`}>↑</button>
          <button type="button" onClick={() => moveItem(item.id, 1)} disabled={index === siblings.length - 1} aria-label={`Posunúť ${item.label} nižšie`}>↓</button>
          {!item.parentId && <button type="button" onClick={() => addItem(item.id)}>+ Podmenu</button>}
          <button type="button" className="is-danger" onClick={() => removeItem(item.id)}>Odstrániť</button>
        </div>
      </div>
    );
  }

  return <section className="admin-navigation-editor">
    <div className="admin-navigation-toolbar">
      <div><strong>Položky hlavného menu</strong><span>Potiahni položku alebo použi šípky. Podmenu môže mať jednu úroveň.</span></div>
      <button type="button" className="admin-primary-action" onClick={() => addItem()}>+ Pridať položku</button>
    </div>
    <div className="admin-navigation-list">{roots.map((root) => <div className="admin-navigation-family" key={root.id}>{renderRow(root)}{items.filter((item) => item.parentId === root.id).map(renderRow)}</div>)}</div>
    <div className="admin-navigation-savebar">
      <button type="button" className="admin-navigation-reset" onClick={() => { setItems(normalizePositions(defaultNavigationItems)); setMessage(""); }}>Obnoviť predvolené menu</button>
      {message && <p role="status">{message}</p>}
      <button type="button" className="admin-primary-action" onClick={save} disabled={saving}>{saving ? "Ukladám…" : "Uložiť navigáciu"}</button>
    </div>
  </section>;
}
