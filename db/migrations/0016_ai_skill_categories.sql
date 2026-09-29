UPDATE cms_entries
SET payload = (payload - 'category' - 'subcategory') || jsonb_build_object('categoryId', ''),
    category_id = NULL,
    revision = revision + 1,
    updated_at = now()
WHERE section = 'ai' AND collection = 'skills'
  AND (payload ? 'category' OR payload ? 'subcategory' OR NOT payload ? 'categoryId');
