UPDATE articles SET created_at = TIMESTAMPTZ '2026-01-01 08:00:00+08:00'
WHERE created_at IS NULL;

UPDATE cms_entries SET created_at = TIMESTAMPTZ '2026-01-01 08:00:00+08:00'
WHERE created_at IS NULL;

ALTER TABLE articles ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE cms_entries ALTER COLUMN created_at SET NOT NULL;
