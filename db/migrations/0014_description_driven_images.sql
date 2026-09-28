UPDATE cms_entries
SET payload = jsonb_set(payload, '{coverDescription}', to_jsonb(''::text), true)
WHERE (section, collection) IN (
  ('tracks', 'playlists'), ('films', 'items'), ('podcasts', 'items'),
  ('travel', 'items'), ('hobbies', 'items'), ('books', 'items')
)
AND NOT payload ? 'coverDescription';

DO $migration$
DECLARE
  saved jsonb;
  changed jsonb;
  field_name text;
  old_default text;
  new_default text;
  previous_prompt text;
  converted text;
  placeholder text;
BEGIN
  SELECT value INTO saved FROM cms_sections WHERE section = 'aiSettings';
  IF saved IS NULL THEN RETURN; END IF;
  changed := saved;
  FOR field_name, old_default, new_default IN
    SELECT * FROM (VALUES
      ('projectImagePrompt',
        E'为以下项目生成一张横向封面图。\n项目名称：{{title}}\n副标题：{{subtitle}}\n摘要：{{excerpt}}\n视觉风格：{{style}}\n用具体的物件、场景与空间关系表达项目用途，保持一个视觉焦点，留出裁切余量。不要文字、标志或水印。',
        E'为项目生成一张横向配图。\n图片描述：{{description}}\n视觉风格：{{style}}\n根据图片描述中的物件、场景与空间关系构图，保持一个视觉焦点，留出裁切余量。不要文字、标志或水印。'),
      ('playlistCoverPrompt',
        '为歌单生成一张原创封面。歌单名称：{{title}}。歌单简介：{{excerpt}}。视觉风格：{{style}}。方形 1:1 构图，视觉焦点明确，不添加文字、标志或水印。',
        '为歌单生成一张原创封面。图片描述：{{description}}。视觉风格：{{style}}。方形 1:1 构图，视觉焦点明确，不添加文字、标志或水印。'),
      ('filmCoverPrompt',
        '根据以下电影信息创作一张原创电影封面，不冒充官方海报。电影名称：{{title}}。导演：{{director}}。视觉风格：{{style}}。提炼故事中的场景、物件和情绪，形成单一视觉焦点。竖向 9:16 构图，保留裁切余量，不添加文字、水印或标志。',
        '根据图片描述创作一张原创电影封面，不冒充官方海报。图片描述：{{description}}。视觉风格：{{style}}。提炼描述中的场景、物件和情绪，形成单一视觉焦点。竖向 9:16 构图，保留裁切余量，不添加文字、水印或标志。'),
      ('podcastCoverPrompt',
        '为播客生成 3:2 横版封面。标题：{{title}}。简介：{{excerpt}}。主播：{{host}}。风格：{{style}}。用场景、物件和色彩传达节目的主题与谈话氛围，不添加文字。',
        '为播客生成 3:2 横版封面。图片描述：{{description}}。风格：{{style}}。用场景、物件和色彩传达描述中的主题与谈话氛围，不添加文字。'),
      ('travelCoverPrompt',
        '为旅行记录创作封面。标题：{{title}}。简介：{{excerpt}}。风格：{{style}}。按目的地和风景线索构图，不添加文字或水印。',
        '为旅行记录创作封面。图片描述：{{description}}。风格：{{style}}。根据描述中的目的地和风景线索构图，不添加文字或水印。'),
      ('hobbyCoverPrompt',
        '为爱好记录创作封面。爱好：{{title}}。简介：{{excerpt}}。风格：{{style}}。围绕具体活动构图，不添加文字或水印。',
        '为爱好记录创作封面。图片描述：{{description}}。风格：{{style}}。围绕描述中的具体活动构图，不添加文字或水印。'),
      ('bookCoverPrompt',
        '为书籍创作原创视觉封面。书名：{{title}}。作者：{{author}}。风格：{{style}}。围绕书名和作者线索表达主题，作者未提供时仅根据书名构图，不冒充官方封面，不添加文字或水印。',
        '为书籍创作原创视觉封面。图片描述：{{description}}。风格：{{style}}。根据图片描述表达主题，不冒充官方封面，不添加文字或水印。')
    ) AS prompts(field, old_prompt, new_prompt)
  LOOP
    previous_prompt := changed->>field_name;
    IF previous_prompt IS NULL THEN CONTINUE; END IF;
    IF previous_prompt = old_default THEN
      converted := new_default;
    ELSE
      converted := previous_prompt;
      FOREACH placeholder IN ARRAY ARRAY['title', 'subtitle', 'excerpt', 'director', 'host', 'author'] LOOP
        converted := replace(converted, '{{' || placeholder || '}}', '{{description}}');
      END LOOP;
      IF position('{{description}}' IN converted) = 0 THEN
        converted := converted || E'\n图片描述：{{description}}';
      END IF;
    END IF;
    IF converted IS DISTINCT FROM previous_prompt THEN
      changed := jsonb_set(changed, ARRAY[field_name], to_jsonb(converted), true);
    END IF;
  END LOOP;
  IF changed IS DISTINCT FROM saved THEN
    UPDATE cms_sections SET value = changed, revision = revision + 1, updated_at = now()
    WHERE section = 'aiSettings';
  END IF;
END
$migration$;
