UPDATE articles SET created_at = TIMESTAMPTZ '2026-01-01 08:00:00+08:00'
WHERE created_at IS NULL;

UPDATE cms_entries SET created_at = TIMESTAMPTZ '2026-01-01 08:00:00+08:00'
WHERE created_at IS NULL;

UPDATE cms_sections SET
  value = jsonb_set(value, '{storyImagePrompt}', to_jsonb(E'为一条中文个人博客说说创作配图。\n图片描述：{{description}}\n视觉风格：{{style}}\n根据图片描述呈现场景、主体与细节，用一个明确视觉焦点表达内容。画面自然、有叙事感，适合说说图片展示。不要添加文字、字母、数字、标志、水印或虚构截图。'::text)),
  revision = revision + 1,
  updated_at = now()
WHERE section = 'aiSettings'
  AND value->>'storyImagePrompt' = E'为一条中文个人博客说说创作配图。\n说说话题：{{title}}\n说说文字：{{excerpt}}\n视觉风格：{{style}}\n根据话题和文字选择合适的场景与表现方式，用一个明确视觉焦点表达内容。画面自然、有叙事感，适合说说图片展示。不要添加文字、字母、数字、标志、水印或虚构截图。';

CREATE INDEX IF NOT EXISTS articles_creation_idx ON articles (created_at DESC, slug);
