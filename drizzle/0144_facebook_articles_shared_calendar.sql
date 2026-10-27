-- Facebook articles use the existing photo scheduler and its common calendar.
-- Apply through the reviewed production D1 migration procedure before the code deploys.
ALTER TABLE managed_articles ADD COLUMN social_caption TEXT NOT NULL DEFAULT '';
ALTER TABLE facebook_image_posts ADD COLUMN article_id INTEGER REFERENCES managed_articles(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS facebook_image_posts_article_idx ON facebook_image_posts(article_id) WHERE article_id IS NOT NULL;
ALTER TABLE facebook_image_posts ADD COLUMN article_image_mode TEXT NOT NULL DEFAULT 'photo' CHECK(article_image_mode IN ('photo','graphic'));
ALTER TABLE facebook_image_posts ADD COLUMN article_include_link INTEGER NOT NULL DEFAULT 1 CHECK(article_include_link IN (0,1));
