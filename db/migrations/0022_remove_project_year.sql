UPDATE cms_entries
SET payload = payload - 'year',
    search_text = concat_ws(' ',
      COALESCE(payload->>'title', ''), COALESCE(payload->>'name', ''),
      COALESCE(payload->>'description', ''), COALESCE(payload->>'excerpt', ''),
      COALESCE(payload->>'text', ''), COALESCE(payload->>'summary', ''),
      COALESCE(payload->>'author', ''), COALESCE(payload->>'artist', ''),
      COALESCE(payload->>'tag', ''), COALESCE(payload->>'body', ''),
      (SELECT string_agg(paragraph, ' ') FROM jsonb_array_elements_text(
        COALESCE(payload->'paragraphs', '[]'::jsonb)) AS paragraph)),
    revision = revision + 1
WHERE section = 'projects' AND collection = 'items' AND payload ? 'year';
