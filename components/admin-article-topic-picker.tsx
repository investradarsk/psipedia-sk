"use client";

import { useMemo, useState } from "react";
import type { ArticleTopic } from "@/lib/article-topics";

export function AdminArticleTopicPicker({
  topics,
  value,
  onChange,
}: {
  topics: ArticleTopic[];
  value: number[];
  onChange(ids: number[]): void;
}) {
  const [available, setAvailable] = useState(topics);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const normalized = query.trim().toLocaleLowerCase("sk-SK");
  const visible = useMemo(
    () => available.filter((topic) => (topic.isActive || value.includes(topic.id))
      && (!normalized || topic.label.toLocaleLowerCase("sk-SK").includes(normalized))),
    [available, normalized, value],
  );
  const selected = available.filter((topic) => value.includes(topic.id));

  function toggle(id: number) {
    onChange(value.includes(id) ? value.filter((topicId) => topicId !== id) : [...value, id]);
  }

  async function createFromQuery() {
    const label = query.trim();
    if (!label) return;
    setCreating(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/article-topics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const data = await response.json() as { topic?: ArticleTopic; existing?: boolean; error?: string };
      if (!response.ok || !data.topic) throw new Error(data.error || "Tému sa nepodarilo vytvoriť.");
      setAvailable((current) => current.some((topic) => topic.id === data.topic!.id) ? current : [...current, data.topic!]);
      if (!value.includes(data.topic.id)) onChange([...value, data.topic.id]);
      setMessage(data.existing ? "Ekvivalentná téma už existovala a bola vybraná." : "Nová téma bola vytvorená a vybraná.");
      setQuery("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Tému sa nepodarilo vytvoriť.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="admin-field admin-field--full">
      <label htmlFor="article-topic-search">Témy článku</label>
      <small>Interné redakčné témy. Môžeš vybrať viac tém alebo článok nechať bez témy.</small>
      {selected.length > 0 && (
        <div className="admin-article-tags" aria-label="Vybrané témy">
          {selected.map((topic) => (
            <button type="button" key={topic.id} onClick={() => toggle(topic.id)}>
              {topic.label}{topic.isActive ? "" : " (neaktívna)"} ×
            </button>
          ))}
        </div>
      )}
      <input
        id="article-topic-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Hľadať alebo vytvoriť tému"
        autoComplete="off"
      />
      <div className="admin-article-tags" aria-label="Dostupné témy">
        {visible.slice(0, 40).map((topic) => (
          <button
            type="button"
            key={topic.id}
            aria-pressed={value.includes(topic.id)}
            onClick={() => toggle(topic.id)}
          >
            {value.includes(topic.id) ? "✓ " : ""}{topic.label}{topic.isActive ? "" : " (neaktívna)"}
          </button>
        ))}
      </div>
      {query.trim() && !available.some((topic) => topic.label.toLocaleLowerCase("sk-SK") === query.trim().toLocaleLowerCase("sk-SK")) && (
        <button type="button" className="admin-secondary-action" disabled={creating} onClick={() => void createFromQuery()}>
          {creating ? "Vytváram…" : `+ Vytvoriť tému „${query.trim()}“`}
        </button>
      )}
      {message && <small role="status">{message}</small>}
    </div>
  );
}
