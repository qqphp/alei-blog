DROP TABLE IF EXISTS cms_section_parts;

WITH ranked AS (
  SELECT ctid, (row_number() OVER (ORDER BY position, slug) - 1)::integer AS pos
  FROM articles
)
UPDATE articles AS article
SET position = ranked.pos
FROM ranked
WHERE article.ctid = ranked.ctid
  AND article.position IS DISTINCT FROM ranked.pos;

WITH ranked AS (
  SELECT ctid, (row_number() OVER (ORDER BY position, id) - 1)::integer AS pos
  FROM article_categories
)
UPDATE article_categories AS category
SET position = ranked.pos
FROM ranked
WHERE category.ctid = ranked.ctid
  AND category.position IS DISTINCT FROM ranked.pos;

WITH ranked AS (
  SELECT ctid, (row_number() OVER (PARTITION BY section, collection ORDER BY position, id) - 1)::integer AS pos
  FROM cms_entries
)
UPDATE cms_entries AS entry
SET position = ranked.pos
FROM ranked
WHERE entry.ctid = ranked.ctid
  AND entry.position IS DISTINCT FROM ranked.pos;

ALTER TABLE articles
  ADD CONSTRAINT articles_position_key UNIQUE (position) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE article_categories
  ADD CONSTRAINT article_categories_position_key UNIQUE (position) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE cms_entries
  ADD CONSTRAINT cms_entries_position_key UNIQUE (section, collection, position) DEFERRABLE INITIALLY DEFERRED;
