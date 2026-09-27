ALTER TABLE cms_entries ADD COLUMN IF NOT EXISTS status_id text;

UPDATE cms_entries
SET status_id = payload->>'statusId'
WHERE section = 'projects' AND collection = 'items'
  AND coalesce(payload->>'statusId', '') <> '';

CREATE INDEX IF NOT EXISTS cms_entries_status_idx
  ON cms_entries (section, collection, status_id, position)
  WHERE status_id IS NOT NULL;

UPDATE cms_sections
SET value = value - 'title' - 'label' - 'description',
    revision = revision + 1,
    updated_at = now()
WHERE section = 'investing'
  AND value ?| ARRAY['title', 'label', 'description'];
