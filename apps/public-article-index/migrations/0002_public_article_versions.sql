CREATE TABLE public_article_versions (
  id TEXT PRIMARY KEY NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL CHECK (deleted IN (0, 1))
);
INSERT INTO public_article_versions (id, updated_at, deleted)
SELECT id, updated_at, 0 FROM public_article_summaries;
