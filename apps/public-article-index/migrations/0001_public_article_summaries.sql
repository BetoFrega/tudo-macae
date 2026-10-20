CREATE TABLE public_article_summaries (
  id TEXT PRIMARY KEY NOT NULL,
  story_id TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  media_ids TEXT NOT NULL,
  published_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX public_article_summaries_visibility_order
  ON public_article_summaries (published_at DESC, id DESC);
