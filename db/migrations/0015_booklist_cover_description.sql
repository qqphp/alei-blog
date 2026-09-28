UPDATE cms_entries
SET payload = jsonb_set(payload, '{coverDescription}', to_jsonb(''::text), true)
WHERE section = 'books' AND collection = 'lists'
AND NOT payload ? 'coverDescription';

DO $migration$
DECLARE
  saved jsonb;
  previous_prompt text;
  converted text;
BEGIN
  SELECT value INTO saved FROM cms_sections WHERE section = 'aiSettings';
  IF saved IS NULL THEN RETURN; END IF;
  previous_prompt := saved->>'booklistCoverPrompt';
  IF previous_prompt IS NULL THEN RETURN; END IF;
  IF previous_prompt = '为主题书单创作原创封面。书单名称：{{title}}。书单简介：{{excerpt}}。风格：{{style}}。用象征性场景、物件和色彩表达主题，不添加文字、水印或虚构的官方标志。' THEN
    converted := '为主题书单创作原创封面。图片描述：{{description}}。风格：{{style}}。用描述中的场景、物件和色彩表达主题，不添加文字、水印或虚构的官方标志。';
  ELSE
    converted := replace(replace(previous_prompt, '{{title}}', '{{description}}'), '{{excerpt}}', '{{description}}');
    IF position('{{description}}' IN converted) = 0 THEN
      converted := converted || E'\n图片描述：{{description}}';
    END IF;
  END IF;
  IF converted IS DISTINCT FROM previous_prompt THEN
    UPDATE cms_sections
    SET value = jsonb_set(value, '{booklistCoverPrompt}', to_jsonb(converted), true),
        revision = revision + 1, updated_at = now()
    WHERE section = 'aiSettings';
  END IF;
END
$migration$;
