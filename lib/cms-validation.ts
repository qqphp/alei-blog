import { activitySample, type ActivityDocument } from './activity-content';
import { bookSample, type BookDocument } from './book-content';
import { podcastSample, type PodcastDocument } from './podcast-content';
import { filmSample, type FilmDocument } from './film-content';
import { musicSample, type MusicDocument } from './music-content';
import { defaults, type Section } from './cms-defaults';
import { skillCategorySample } from './ai-resources';
import { storyDate } from './story-content';

export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };
export function isSection(key: string): key is Section {
  return Object.hasOwn(defaults, key);
}

const imageSizeFields = [
  ['文章封面', 'coverSize'],
  ['项目图片', 'projectImageSize'],
  ['说说图片', 'storyImageSize'],
  ['歌单封面', 'playlistCoverSize'],
  ['电影封面', 'filmCoverSize'],
  ['播客封面', 'podcastCoverSize'],
  ['旅行封面', 'travelCoverSize'],
  ['爱好封面', 'hobbyCoverSize'],
  ['书籍封面', 'bookCoverSize'],
  ['书单封面', 'booklistCoverSize'],
] as const;

function validImageSize(value: string) {
  if (value === 'auto') return true;
  const match = /^(\d+)x(\d+)$/.exec(value);
  if (!match) return false;
  const width = Number(match[1]);
  const height = Number(match[2]);
  const pixels = width * height;
  return (
    width > 0 &&
    height > 0 &&
    width <= 3840 &&
    height <= 3840 &&
    width % 16 === 0 &&
    height % 16 === 0 &&
    Math.max(width, height) / Math.min(width, height) <= 3 &&
    pixels >= 655360 &&
    pixels <= 8294400
  );
}

export function validateContent(key: Section, value: unknown) {
  const walk = (
    input: unknown,
    sample: unknown,
    path: string,
    field = '',
  ): void => {
    const fail = (message: string): never => {
      throw new Error(`${path}：${message}`);
    };
    if (Array.isArray(sample)) {
      if (!Array.isArray(input)) fail('需要列表');
      const list = input as unknown[];
      const growingCollection = path === key || path === `${key}.items` || path === `${key}.lists` ||
        (key === 'ai' && ['ai.agents', 'ai.skills', 'ai.relays', 'ai.agentStatuses', 'ai.skillCategories'].includes(path));
      if (list.length > (growingCollection ? 10000 : 500))
        fail(growingCollection ? '最多 10000 项' : '最多 500 项');
      const itemSample = path === 'ai.skillCategories' ? skillCategorySample : sample[0] ?? '';
      list.forEach((item, i) => walk(item, itemSample, `${path}[${i + 1}]`));
      for (const identity of ['id', 'slug']) {
        const ids = list.flatMap((item) =>
          item && typeof item === 'object' && identity in item
            ? [(item as Record<string, unknown>)[identity]]
            : [],
        );
        if (new Set(ids).size !== ids.length) fail(`${identity} 不能重复`);
      }
      if (field === 'images' && key === 'projects' && list.length === 0)
        fail('项目至少需要一张图片');
    } else if (sample && typeof sample === 'object') {
      if (!input || typeof input !== 'object' || Array.isArray(input))
        fail('需要对象');
      const object = input as Record<string, unknown>;
      for (const name of Object.keys(object))
        if (!Object.hasOwn(sample, name)) fail(`不支持的字段 ${name}`);
      for (const [name, example] of Object.entries(sample))
        walk(object[name], example, `${path}.${name}`, name);
    } else {
      if (key === 'tracks' && field === 'duration' && input === null)
        fail('请上传音频或填写时长');
      if (typeof input !== typeof sample) fail(`需要 ${typeof sample}`);
      if (typeof input === 'string') {
        if (input.length > (field === 'body' || (key === 'investing' && path.includes('.paragraphs[')) ? 200000 : 30000))
          fail('文字过长');
        if (['id', 'slug', 'title', 'name'].includes(field) && !input.trim())
          fail('不能为空');
        if (['id', 'slug'].includes(field) && !/^[a-zA-Z0-9_-]+$/.test(input))
          fail('请使用英文、数字、短横线或下划线');
        if (
          /^(url|href|src|audio|cover|image|publicAccountQr|serviceUrl|footerUrl)$/i.test(
            field,
          ) &&
          input
        ) {
          if (
            !/^(https?:\/\/|\/(?!\/)|#)/i.test(input) ||
            /[\s\\]/.test(input) ||
            Array.from(input).some((char) => char.charCodeAt(0) < 32)
          )
            fail('请使用 http(s) 地址或以 / 开头的本站路径');
          if (/^https?:/i.test(input)) {
            try {
              new URL(input);
            } catch {
              fail('网址无效');
            }
          }
        }
        if (
          (['src', 'image'].includes(field) ||
            (field === 'cover' &&
              key !== 'writing' &&
              key !== 'tracks' &&
              key !== 'films' &&
              key !== 'podcasts' && key !== 'travel' && key !== 'hobbies' && key !== 'books')) &&
          !input.trim()
        )
          fail('请填写图片或音频地址');
        if (
          field === 'date' &&
          (!/^\d{4}[-.]\d{2}[-.]\d{2}/.test(input) ||
            !Number.isFinite(Date.parse(input.replaceAll('.', '-'))))
        )
          fail('日期格式无效');
        if (field === 'color' && !/^#[0-9a-f]{6}$/i.test(input))
          fail('请输入六位十六进制颜色');
      }
      if (
        typeof input === 'number' &&
        (!Number.isFinite(input) || input < 0 || input > 1000000)
      )
        fail('数值需要在 0 到 1000000 之间');
      if (['width', 'height', 'duration'].includes(field) && input === 0)
        fail('必须大于 0');
    }
  };
  walk(
    value,
    key === 'tracks'
      ? musicSample
      : key === 'films'
        ? filmSample
        : key === 'podcasts'
          ? podcastSample
          : key === 'travel' || key === 'hobbies' ? activitySample : key === 'books' ? bookSample : defaults[key],
    key,
  );
  if (key === 'ai') {
    const document = value as typeof defaults.ai;
    const statusIds = new Set(document.agentStatuses.map((item) => item.id));
    const statusNames = document.agentStatuses.map((item) => item.name.trim());
    if (statusNames.some((name) => !name) || new Set(statusNames).size !== statusNames.length)
      throw new Error('智能体状态名称不能为空或重复');
    const categories = new Map(document.skillCategories.map((item) => [item.id, item]));
    const names = document.skillCategories.map((item) => JSON.stringify([item.parentId, item.name.trim()]));
    if (new Set(names).size !== names.length || document.skillCategories.some((item) => item.name.trim() === '全部' || item.name.trim() === '未分类'))
      throw new Error('同级 Skills 分类不能重名或使用保留名称');
    for (const item of document.skillCategories) {
      if (!item.name.trim()) throw new Error('请填写 Skills 分类名称');
      if (item.parentId && (!categories.has(item.parentId) || item.parentId === item.id || categories.get(item.parentId)?.parentId))
        throw new Error('Skills 分类最多两层，上级只能选择一级分类');
      if (document.skillCategories.some((child) => child.parentId === item.id) && item.parentId)
        throw new Error('有子分类的 Skills 分类不能改为二级');
    }
    for (const skill of document.skills)
      if (skill.categoryId && !categories.has(skill.categoryId))
        throw new Error('请选择有效的 Skills 分类');
    for (const item of [...document.agents, ...document.skills, ...document.relays]) {
      try {
        const url = new URL(item.href);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      } catch { throw new Error('资源链接必须是有效的 HTTP/HTTPS 地址'); }
    }
    for (const item of document.agents) {
      if (!statusIds.has(item.status)) throw new Error('智能体状态无效');
    }
    for (const item of [...document.agents, ...document.relays]) {
      const isEmoji = document.agents.includes(item as typeof document.agents[number]) &&
        /^\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F|\u200D\p{Extended_Pictographic})*$/u.test(item.logo);
      if (item.logo && !isEmoji && (!/^(https?:\/\/|\/(?!\/))/i.test(item.logo) || /[\s\\]/.test(item.logo)))
        throw new Error('Logo 请使用图片地址、本站素材路径或智能体 Emoji');
      if (/^https?:/i.test(item.logo)) {
        try { new URL(item.logo); } catch { throw new Error('Logo 地址无效'); }
      }
    }
  }
  if (key === 'travel' || key === 'hobbies' || key === 'books') {
    const doc = value as ActivityDocument | BookDocument;
    const names = doc.categories.map(item => item.name.trim());
    if (new Set(names).size !== names.length || names.includes('全部')) throw new Error('分类不能重复或命名为全部');
    for (const item of doc.items) {
      if (!doc.categories.some(category => category.id === item.categoryId)) throw new Error('请选择有效分类；删除分类前请调整关联内容（含草稿）');
      if (item.cover.startsWith('#')) throw new Error('请使用有效封面地址');
    }
    if (key === 'travel' || key === 'hobbies') {
      for (const item of (value as ActivityDocument).items) {
        if (item.album.length > 50) throw new Error('相册最多 50 张图片');
        for (const url of item.album) walk(url, '', '相册图片', 'image');
        if (item.album.some(url => url.startsWith('#'))) throw new Error('请使用有效相册图片地址');
      }
    }
    if (key === 'books') {
      const books = value as BookDocument;
      for (const list of books.lists) {
        if (list.cover.startsWith('#')) throw new Error('请使用有效书单封面地址');
      }
    }
  }
  if (key === 'podcasts') {
    const document = value as PodcastDocument;
    const names = document.categories.map((item) => item.name.trim());
    if (new Set(names).size !== names.length || names.includes('全部'))
      throw new Error('播客分类不能重复或命名为全部');
    for (const item of document.items) {
      if (
        !document.categories.some((category) => category.id === item.categoryId)
      )
        throw new Error('请选择有效播客分类；删除前需调整关联播客');
      if (!['upload', 'ai'].includes(item.coverMode))
        throw new Error('请选择播客封面来源');
      if (item.cover.startsWith('#') || item.audio.startsWith('#'))
        throw new Error('请使用有效的封面或音频地址');
    }
  }
  if (key === 'films') {
    const document = value as FilmDocument;
    const names = document.categories.map((item) => item.name.trim());
    if (new Set(names).size !== names.length || names.includes('全部'))
      throw new Error('电影分类不能重复或命名为全部');
    for (const film of document.items) {
      if (film.cover.startsWith('#'))
        throw new Error('请使用有效的电影封面地址');
      if (!document.categories.some((item) => item.id === film.categoryId))
        throw new Error('请选择有效电影分类；删除前需调整关联电影');
      if (!['upload', 'ai'].includes(film.coverMode))
        throw new Error('请选择电影封面来源');
    }
  }
  if (key === 'tracks') {
    const document = value as MusicDocument;
    const names = document.scenes.map((scene) => scene.name.trim());
    if (new Set(names).size !== names.length)
      throw new Error('场景名称不能重复');
    for (const list of document.playlists)
      if (!['upload', 'ai'].includes(list.coverMode))
        throw new Error('请选择歌单封面来源');
    for (const track of document.items) {
      const scene = document.scenes.find((scene) => scene.id === track.moodId);
      if (!scene) throw new Error('请选择有效场景；删除场景前请调整关联音乐');
    }
    for (const track of document.items)
      if (track.src.startsWith('#')) throw new Error('请填写可播放的音频地址');
  }
  if (key === 'stories')
    for (const item of value as typeof defaults.stories) {
      if (item._published && !item.text.trim())
        throw new Error('发布说说前请填写文字');
      if (item.text.length > 5000) throw new Error('说说文字最多 5000 字');
      if (
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/.test(item.date) ||
        storyDate(new Date(item.date)) !== item.date
      )
        throw new Error('请选择有效的年月日时分秒（北京时间）');
      if (
        item.topics.length > 6 ||
        item.topics.some((topic) => !topic.trim() || topic.length > 40) ||
        new Set(item.topics.map((topic) => topic.trim())).size !==
          item.topics.length
      )
        throw new Error('话题不能重复或为空，每个最多 40 字，最多 6 个');
    }
  if (key === 'aiSettings') {
    const settings = value as typeof defaults.aiSettings;
    for (const [label, field] of imageSizeFields)
      if (!validImageSize(settings[field]))
        throw new Error(
          `${label}尺寸须为 auto 或宽x高；宽高需为 16 的倍数且不超过 3840，长宽比不超过 3:1，总像素数须在 655360 到 8294400 之间`,
        );
    validateProviderUrl(settings.baseUrl);
    if (!settings.textModel.trim() || !settings.imageModel.trim())
      throw new Error('请填写模型名称');
    if (!['png', 'jpeg', 'webp'].includes(settings.imageOutputFormat))
      throw new Error('图片输出格式无效');
    if (!Number.isInteger(settings.imageCompression) || settings.imageCompression < 1 || settings.imageCompression > 100)
      throw new Error('图片压缩质量须为 1 到 100 的整数');
    if (
      !settings.coverPrompt.includes('{{title}}') ||
      !settings.coverPrompt.includes('{{excerpt}}')
    )
      throw new Error('封面提示词必须包含 {{title}} 和 {{excerpt}}');
  }
  if (key === 'aiSettings') {
    const settings = value as typeof defaults.aiSettings;
    for (const field of ['projectImagePrompt', 'playlistCoverPrompt', 'filmCoverPrompt',
      'podcastCoverPrompt', 'travelCoverPrompt', 'hobbyCoverPrompt', 'bookCoverPrompt',
      'booklistCoverPrompt'] as const) {
      const prompt = settings[field];
      if (!prompt.includes('{{description}}') || /\{\{(?:title|subtitle|excerpt|director|host|author)\}\}/.test(prompt))
        throw new Error('图片描述生成提示词须包含 {{description}}，不再使用标题等内容占位符');
    }
    if (
      !settings.storyImagePrompt.includes('{{description}}') ||
      ['title', 'excerpt'].some((key) => settings.storyImagePrompt.includes('{{' + key + '}}'))
    )
      throw new Error('说说图片提示词须包含 {{description}}，不再使用话题或文字占位符');
  }
  if (key === 'bookmarks' || key === 'friends') {
    const document = value as typeof defaults.bookmarks;
    const names = document.categories.map((item) => item.name.trim());
    if (new Set(names).size !== names.length)
      throw new Error('分类名称不能重复');
    if (names.includes('全部'))
      throw new Error('“全部”用于筛选，请使用其他分类名称');
    for (const item of document.items) {
      if (!document.categories.some((option) => option.id === item.categoryId))
        throw new Error('请选择有效分类；删除分类前请调整关联条目（含草稿）');
      if (key === 'bookmarks' || item.url) {
        try {
          const url = new URL(item.url);
          if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
        } catch {
          throw new Error('请填写完整的 http(s) 网站地址');
        }
      }
    }
  }
  if (key === 'projects') {
    const document = value as typeof defaults.projects;
    for (const key of ['statuses', 'categories'] as const) {
      const names = document[key].map((item) => item.name.trim());
      if (new Set(names).size !== names.length)
        throw new Error('项目状态或分类名称不能重复');
    }
    for (const item of document.items) {
      if (item.createdAt && (!Number.isFinite(Date.parse(item.createdAt)) || new Date(item.createdAt).toISOString() !== item.createdAt))
        throw new Error('请选择有效的项目创建时间');
      if (item.url) {
        try {
          const url = new URL(item.url);
          if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
        } catch {
          throw new Error('请填写完整的 http(s) 项目网址');
        }
      }
      if (item.images.some((image) => !['upload', 'ai'].includes(image.mode)))
        throw new Error('请选择项目图片来源');
      if (!document.statuses.some((option) => option.id === item.statusId))
        throw new Error('请选择有效项目状态；删除状态前请调整关联项目');
      if (!document.categories.some((option) => option.id === item.categoryId))
        throw new Error('请选择有效项目分类；删除分类前请调整关联项目');
    }
  }
  if (key === 'categories') {
    const items = value as typeof defaults.categories;
    const names = items.map((item) =>
      JSON.stringify([item.parentId, item.name.trim()]),
    );
    if (new Set(names).size !== names.length)
      throw new Error('同一层级的分类名称不能重复');
    const parents = new Map(items.map((item) => [item.id, item.parentId]));
    for (const item of items) {
      const visited = new Set([item.id]);
      let parent = item.parentId;
      while (parent) {
        if (!parents.has(parent))
          throw new Error('上级分类不存在，请先调整子分类');
        if (visited.has(parent)) throw new Error('分类不能属于自身或其子分类');
        visited.add(parent);
        parent = parents.get(parent)!;
      }
    }
  }
  if (key === 'writing')
    for (const item of value as typeof defaults.writing) {
      if (!['ai', 'upload'].includes(item.coverMode))
        throw new Error('请选择 AI 生成或上传封面');
      if (!item.categoryId) throw new Error('请选择文章分类');
      if (
        !/^\d{4}[.-]\d{2}[.-]\d{2}$/.test(item.date) ||
        new Date(`${item.date.replaceAll('.', '-')}T00:00:00Z`)
          .toISOString()
          .slice(0, 10) !== item.date.replaceAll('.', '-')
      )
        throw new Error('请选择有效的发布日期');
      if (item._published && !item.cover)
        throw new Error('发布文章前请上传或生成文章封面');
    }
}

export function validateProviderUrl(value: string, image = false) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('请输入有效的 API Base URL');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (!image && url.search) ||
    url.hash ||
    !url.hostname.includes('.') ||
    /^(\d|\[)/.test(url.hostname) ||
    /\.(localhost|local|internal)$/.test(url.hostname)
  )
    throw new Error('API 和图片地址须使用公开 HTTPS 域名');
  return url;
}

/** Draft records are removed on the server, before public RSC serialization. */
export function publishedOnly(value: unknown): unknown {
  if (Array.isArray(value))
    return value
      .filter(
        (item) =>
          !(item && typeof item === 'object' && item._published === false),
      )
      .map(publishedOnly);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== '_published')
        .map(([key, item]) => [key, publishedOnly(item)]),
    );
  return value;
}
