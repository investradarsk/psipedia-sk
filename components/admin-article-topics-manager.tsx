"use client";

import { useMemo, useState } from "react";
import type { ArticleTopic } from "@/lib/article-topics";

function TopicRow({ topic, onSaved }: { topic: ArticleTopic; onSaved(topic: ArticleTopic): void }) {
  const [label, setLabel] = useState(topic.label);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save(nextActive = topic.isActive) {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/article-topics/${topic.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label, isActive: nextActive }),
      });
      const data = await response.json() as { topic?: ArticleTopic; error?: string };
      if (!response.ok || !data.topic) throw new Error(data.error || "Tému sa nepodarilo uložiť.");
      onSaved({ ...data.topic, articleCount: topic.articleCount });
      setLabel(data.topic.label);
      setMessage("Uložené.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Tému sa nepodarilo uložiť.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="admin-article-row">
      <div className="admin-article-main">
        <div className="admin-article-tags">
          <span>{topic.isActive ? "Aktívna" : "Neaktívna"}</span>
          <span>{topic.articleCount ?? 0} článkov</span>
          <span>/{topic.slug}</span>
        </div>
        <label className="admin-field">
          <span className="sr-only">Názov témy</span>
          <input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={120} />
        </label>
        {message && <small role="status">{message}</small>}
      </div>
      <div className="admin-row-actions">
        <button type="button" disabled={saving || !label.trim()} onClick={() => void save()}>{saving ? "Ukladám…" : "Uložiť názov"}</button>
        <button type="button" disabled={saving} onClick={() => void save(!topic.isActive)}>
          {topic.isActive ? "Deaktivovať" : "Aktivovať"}
        </button>
      </div>
    </article>
  );
}

export function AdminArticleTopicsManager({ initialTopics }: { initialTopics: ArticleTopic[] }) {
  const [topics, setTopics] = useState(initialTopics);
  const [query, setQuery] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("sk-SK");
    return needle ? topics.filter((topic) => topic.label.toLocaleLowerCase("sk-SK").includes(needle) || topic.slug.includes(needle)) : topics;
  }, [query, topics]);

  async function createTopic() {
    const label = newLabel.trim();
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
      setTopics((current) => current.some((topic) => topic.id === data.topic!.id) ? current : [...current, { ...data.topic!, articleCount: 0 }]);
      setNewLabel("");
      setMessage(data.existing ? "Ekvivalentná téma už existuje." : "Téma bola vytvorená.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Tému sa nepodarilo vytvoriť.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <section className="admin-panel">
        <div className="admin-toolbar">
          <label className="admin-search"><span className="sr-only">Hľadať tému</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Hľadať tému" /></label>
          <label className="admin-search"><span className="sr-only">Nová téma</span><input value={newLabel} onChange={(event) => setNewLabel(event.target.value)} placeholder="Nová téma, napr. Field trials" /></label>
          <button type="button" disabled={creating || !newLabel.trim()} onClick={() => void createTopic()}>{creating ? "Vytváram…" : "+ Vytvoriť tému"}</button>
        </div>
        {message && <p className="admin-flash" role="status">{message}</p>}
        <p className="admin-event-result-count">Témy: {filtered.length} · aktívne: {topics.filter((topic) => topic.isActive).length}</p>
        <div className="admin-article-list">
          {filtered.map((topic) => (
            <TopicRow
              key={topic.id}
              topic={topic}
              onSaved={(saved) => setTopics((current) => current.map((item) => item.id === saved.id ? saved : item))}
            />
          ))}
        </div>
      </section>
    </>
  );
}
