CREATE TABLE article_read_hourly (
  article_id INTEGER NOT NULL,
  bucket_hour TEXT NOT NULL,
  qualified_reads INTEGER NOT NULL DEFAULT 0 CHECK (qualified_reads >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (article_id, bucket_hour),
  FOREIGN KEY (article_id) REFERENCES managed_articles(id) ON DELETE CASCADE
);

CREATE INDEX article_read_hourly_bucket_idx
  ON article_read_hourly(bucket_hour, article_id, qualified_reads);
