-- Creation time is stored in one typed column, not in the generic event date.
UPDATE cms_entries
SET occurred_at = NULL, payload = payload - 'createdAt' - 'updatedAt'
WHERE section = 'projects' AND collection = 'items';

-- The deferred unique position constraints already supply these indexes.
DROP INDEX IF EXISTS articles_position_idx;
DROP INDEX IF EXISTS cms_entries_order_idx;
DROP INDEX IF EXISTS cms_entries_admin_order_idx;

ALTER TABLE articles ADD CONSTRAINT articles_revision_positive CHECK (revision > 0);
ALTER TABLE article_categories ADD CONSTRAINT article_categories_revision_positive CHECK (revision > 0);
ALTER TABLE cms_entries ADD CONSTRAINT cms_entries_revision_positive CHECK (revision > 0);
