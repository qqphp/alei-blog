-- Repair records imported after the earlier search/status migrations ran.
UPDATE cms_entries
SET category_id = COALESCE(payload->>'categoryId', payload->>'moodId', category_id),
    status_id = COALESCE(payload->>'statusId', status_id)
WHERE category_id IS DISTINCT FROM COALESCE(payload->>'categoryId', payload->>'moodId', category_id)
   OR status_id IS DISTINCT FROM COALESCE(payload->>'statusId', status_id);

UPDATE cms_entries
SET search_text = concat_ws(' ',
  payload->>'title', payload->>'name', payload->>'description', payload->>'excerpt',
  payload->>'text', payload->>'summary', payload->>'author', payload->>'artist',
  payload->>'tag', payload->>'body',
  (SELECT string_agg(paragraph, ' ') FROM jsonb_array_elements_text(
    COALESCE(payload->'paragraphs', '[]'::jsonb)) AS paragraph))
WHERE search_text = '';
