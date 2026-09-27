DROP INDEX IF EXISTS articles_public_search_idx;
DROP INDEX IF EXISTS articles_admin_search_idx;
CREATE INDEX articles_public_search_idx
  ON articles USING gin ((title || ' ' || excerpt || ' ' || body) gin_trgm_ops)
  WHERE published;
CREATE INDEX articles_admin_search_idx
  ON articles USING gin ((title || ' ' || excerpt || ' ' || body) gin_trgm_ops);

UPDATE cms_entries
SET search_text = concat_ws(' ',
  title,
  payload->>'description',
  payload->>'tag',
  (SELECT string_agg(paragraph, ' ')
   FROM jsonb_array_elements_text(COALESCE(payload->'paragraphs', '[]'::jsonb)) AS paragraph))
WHERE section = 'investing' AND collection = 'entries';
