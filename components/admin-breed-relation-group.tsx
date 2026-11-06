"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./admin-breed-relation-group.module.css";
import { AdminEditorToolFrame } from "@/components/admin-editor-tool-frame";

export type BreedRelationOption = { id: number; label: string; meta?: string };
export type BreedRelationKind = "articles" | "breeds" | "stations" | "clubs";

type SearchResponse = { items?: BreedRelationOption[]; error?: string };

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("sk");
}

export function AdminBreedRelationGroup({
  title, kind, placeholder, selectedIds, initialOptions, localOptions = [], onToggle,
}: {
  title: string;
  kind: BreedRelationKind;
  placeholder: string;
  selectedIds: number[];
  initialOptions: BreedRelationOption[];
  localOptions?: BreedRelationOption[];
  onToggle: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [known, setKnown] = useState<BreedRelationOption[]>(initialOptions);
  const [remote, setRemote] = useState<BreedRelationOption[]>([]);
  const [resolvedQuery, setResolvedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const trimmed = query.trim();
  const searching = trimmed.length >= 2;

  useEffect(() => {
    if (kind === "breeds" || !searching) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ kind, q: trimmed });
        const response = await fetch("/api/admin/breeds/relation-options?" + params.toString(), {
          cache: "no-store", signal: controller.signal,
        });
        const data = await response.json() as SearchResponse;
        if (!response.ok || !Array.isArray(data.items)) throw new Error(data.error || "Vyhľadávanie zlyhalo.");
        if (!controller.signal.aborted) {
          setRemote(data.items);
          setResolvedQuery(trimmed);
        }
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Vyhľadávanie zlyhalo.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [kind, trimmed, searching]);

  const selected = selectedIds
    .map((id) => known.find((item) => item.id === id))
    .filter((item): item is BreedRelationOption => Boolean(item));

  const candidates = useMemo(() => {
    if (!searching) return [];
    if (kind === "breeds") {
      const needle = normalize(trimmed);
      return localOptions.filter((item) => normalize(item.label).includes(needle)).slice(0, 40);
    }
    return resolvedQuery === trimmed ? remote : [];
  }, [kind, localOptions, remote, resolvedQuery, searching, trimmed]);

  const available = candidates.filter((item) => !selectedIds.includes(item.id));

  function toggle(item: BreedRelationOption) {
    setKnown((current) => current.some((existing) => existing.id === item.id) ? current : [...current, item]);
    onToggle(item.id);
  }

  return (
    <AdminEditorToolFrame kind="relations">
    <fieldset className={styles.group}>
      <legend>{title}</legend>
      <div className={styles.selectedHeading}>
        <strong>Priradené</strong>
        <span>{selected.length}</span>
      </div>
      {selected.length ? (
        <div className={styles.selectedList}>
          {selected.map((item) => (
            <label className={styles.selectedRow} key={item.id}>
              <input type="checkbox" checked onChange={() => toggle(item)} />
              <span className={styles.optionText}><strong>{item.label}</strong>{item.meta && <small>{item.meta}</small>}</span>
            </label>
          ))}
        </div>
      ) : <p className={styles.empty}>Zatiaľ nič nie je priradené.</p>}
      <label className={styles.searchLabel}>
        <span>Pridať ďalšie</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder}
          type="search" autoComplete="off" />
      </label>
      <div className={styles.results} aria-live="polite">
        {!searching ? <p className={styles.help}>{kind==="articles"?"Zadaj aspoň 2 znaky; prehľadávajú sa všetky články.":kind==="breeds"?"Zadaj aspoň 2 znaky názvu plemena.":"Zadaj aspoň 2 znaky; prehľadáva sa celý adresár."}</p>
          : error ? <p className={styles.error} role="alert">{error}</p>
          : kind !== "breeds" && (loading || resolvedQuery !== trimmed) ? <p className={styles.help}>Vyhľadávam…</p>
          : available.length ? (
            <div className={styles.resultList}>
              {available.map((item) => (
                <label className={styles.resultRow} key={item.id}>
                  <input type="checkbox" checked={false} onChange={() => toggle(item)} />
                  <span className={styles.optionText}><strong>{item.label}</strong>{item.meta && <small>{item.meta}</small>}</span>
                </label>
              ))}
            </div>
          ) : <p className={styles.help}>Žiadne ďalšie výsledky. Skús iný názov.</p>}
      </div>
    </fieldset>
    </AdminEditorToolFrame>
  );
}
