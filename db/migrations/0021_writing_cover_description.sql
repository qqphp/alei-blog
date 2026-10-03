DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'articles' AND column_name = 'cover_description') THEN
    ALTER TABLE articles ADD COLUMN cover_description text NOT NULL DEFAULT '';
    UPDATE articles SET revision = revision + 1;
  END IF;
END
$migration$;

DO $migration$
DECLARE
  previous_prompt text;
  converted text;
BEGIN
  SELECT value->>'coverPrompt' INTO previous_prompt FROM cms_sections WHERE section = 'aiSettings';
  IF previous_prompt IS NULL THEN RETURN; END IF;
  IF previous_prompt = E'为一篇中文博客文章创作横向封面插画。\n文章标题：{{title}}\n文章摘要：{{excerpt}}\n视觉风格：{{style}}\n请提炼文章的核心概念，用具象物件与空间关系表达，避免通用机器人、发光大脑和杂乱科技符号。画面有一个明确视觉焦点，边缘保留裁切余量。不要出现文字、字母、数字、标志、水印。横向 3:2 构图，适合博客文章列表与分享封面。' THEN
    converted := E'为一篇中文博客文章创作横向封面插画。\n图片描述：{{description}}\n视觉风格：{{style}}\n根据图片描述中的物件、场景与空间关系构图，避免通用机器人、发光大脑和杂乱科技符号。画面有一个明确视觉焦点，边缘保留裁切余量。不要出现文字、字母、数字、标志、水印。横向 3:2 构图，适合博客文章列表与分享封面。';
  ELSE
    converted := replace(replace(previous_prompt, '{{title}}', '{{description}}'), '{{excerpt}}', '{{description}}');
    IF position('{{description}}' IN converted) = 0 THEN
      converted := converted || E'\n图片描述：{{description}}';
    END IF;
  END IF;
  IF converted IS DISTINCT FROM previous_prompt THEN
    UPDATE cms_sections SET value = jsonb_set(value, '{coverPrompt}', to_jsonb(converted)),
      revision = revision + 1, updated_at = now() WHERE section = 'aiSettings';
  END IF;
END
$migration$;
