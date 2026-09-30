CREATE TABLE article_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  normalized_key TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE UNIQUE INDEX article_topics_slug_unique ON article_topics(slug);
CREATE UNIQUE INDEX article_topics_normalized_key_unique ON article_topics(normalized_key);
CREATE INDEX article_topics_active_label_idx ON article_topics(is_active, label);

CREATE TABLE article_topic_assignments (
  article_id INTEGER NOT NULL,
  topic_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (article_id, topic_id),
  FOREIGN KEY (article_id) REFERENCES managed_articles(id) ON DELETE CASCADE,
  FOREIGN KEY (topic_id) REFERENCES article_topics(id) ON DELETE CASCADE
);

CREATE INDEX article_topic_assignments_article_idx ON article_topic_assignments(article_id);
CREATE INDEX article_topic_assignments_topic_idx ON article_topic_assignments(topic_id);
