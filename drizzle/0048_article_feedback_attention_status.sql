ALTER TABLE `article_feedback` ADD COLUMN `status` text DEFAULT 'new' NOT NULL
  CHECK (`status` IN ('new','reviewing','resolved','dismissed'));
ALTER TABLE `article_feedback` ADD COLUMN `attention_updated_at` text;

UPDATE `article_feedback`
SET `status` = 'resolved',
    `attention_updated_at` = `created_at`;

CREATE INDEX `article_feedback_attention_status_created_idx`
  ON `article_feedback` (`status`, `created_at`);
