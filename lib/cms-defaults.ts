import { migrateActivities } from './activity-content';
import { migrateBooks } from './book-content';
import { migratePodcasts } from './podcast-content';
import { migrateFilms } from './film-content';
import { migrateMusic } from './music-content';
import { migrateDirectory } from './directory-content';
import { writing, stories } from '../app/content';
import { migrateProjects } from './project-content';
import { showcaseProjects } from './project-showcase';
import { profile } from './profile';
import { bookmarks, friends } from './directory-data';
import { books, booklists } from './books';
import { tracks } from './music';
import { lifeContent } from './life-content';
import { aiAgents, aiSkills, aiRelays, type AiSkillCategory } from './ai-resources';
import { researchContent } from './research-content';
import articleSeed from './article-seed.json';
import { categoryId, stripArticleExtras } from './article-categories';

const publish = <T extends object>(items: T[]) =>
  items.map((item) => ({ ...item, _published: true }));
export const defaults = {
  aiSettings: {
    booklistCoverSize: '1536x1024',
    booklistCoverStyle: '3:2 横版编辑插画，以阅读主题为视觉中心，细腻纸张质感、克制的色彩与留白。',
    booklistCoverPrompt: '为主题书单创作原创封面。图片描述：{{description}}。风格：{{style}}。用描述中的场景、物件和色彩表达主题，不添加文字、水印或虚构的官方标志。',
    travelCoverSize: '1536x1024',
    travelCoverStyle: '自然旅行摄影，3:2 横版构图，真实光线、风景层次和安静的旅行氛围。',
    travelCoverPrompt: '为旅行记录创作封面。图片描述：{{description}}。风格：{{style}}。根据描述中的目的地和风景线索构图，不添加文字或水印。',
    hobbyCoverSize: '1536x1024',
    hobbyCoverStyle: '3:2 横版编辑摄影，细腻自然光，突出爱好的物件、动作与日常氛围。',
    hobbyCoverPrompt: '为爱好记录创作封面。图片描述：{{description}}。风格：{{style}}。围绕描述中的具体活动构图，不添加文字或水印。',
    bookCoverSize: '1024x1536',
    bookCoverStyle: '2:3 竖版书籍封面，精炼的插画与象征性构图，有层次的色彩和留白。',
    bookCoverPrompt: '为书籍创作原创视觉封面。图片描述：{{description}}。风格：{{style}}。根据图片描述表达主题，不冒充官方封面，不添加文字或水印。',
    playlistCoverSize: '1024x1024',
    playlistCoverStyle:
      '音乐专辑封面风格，方形 1:1 构图，用克制的色彩和具象场景传达歌单情绪。',
    playlistCoverPrompt:
      '为歌单生成一张原创封面。图片描述：{{description}}。视觉风格：{{style}}。方形 1:1 构图，视觉焦点明确，不添加文字、标志或水印。',
    podcastCoverSize: '1536x1024',
    podcastCoverStyle: '3:2 横版播客封面，编辑摄影与抽象拼贴，围绕节目主题构图，不添加水印或虚构人物肖像。',
    podcastCoverPrompt: '为播客生成 3:2 横版封面。图片描述：{{description}}。风格：{{style}}。用场景、物件和色彩传达描述中的主题与谈话氛围，不添加文字。',
    filmCoverSize: '864x1536',
    filmCoverStyle:
      '电影海报摄影风格，竖向 9:16 构图，深色影调、细腻胶片颗粒、克制的光影和留白。',
    filmCoverPrompt:
      '根据图片描述创作一张原创电影封面，不冒充官方海报。图片描述：{{description}}。视觉风格：{{style}}。提炼描述中的场景、物件和情绪，形成单一视觉焦点。竖向 9:16 构图，保留裁切余量，不添加文字、水印或标志。',

    projectImageSize: '1536x1024',
    projectImageStyle:
      '清晰的产品概念插画，简洁构图，突出项目核心用途，与博客视觉协调，横向构图。',
    projectImagePrompt:
      '为项目生成一张横向配图。\n图片描述：{{description}}\n视觉风格：{{style}}\n根据图片描述中的物件、场景与空间关系构图，保持一个视觉焦点，留出裁切余量。不要文字、标志或水印。',
    storyImageSize: '1536x1024',
    storyImageStyle:
      '自然纪实与编辑感结合的横版画面，真实光线、克制色彩，突出图片描述中的具体场景、情绪和关键意象。',
    storyImagePrompt:
      '为一条中文个人博客说说创作配图。\n图片描述：{{description}}\n视觉风格：{{style}}\n根据图片描述呈现场景、主体与细节，用一个明确视觉焦点表达内容。画面自然、有叙事感，适合说说图片展示。不要添加文字、字母、数字、标志、水印或虚构截图。',
    baseUrl: 'https://api.teamorouter.com/v1',
    textModel: 'gpt-5.4-mini',
    imageModel: 'gpt-image-2',
    imageOutputFormat: 'webp' as 'png' | 'jpeg' | 'webp',
    imageCompression: 80,
    coverSize: '1536x1024',
    coverStyle:
      '现代编辑插画，简洁构图，温暖纸张质感，墨绿与米白为主色，少量暖金色点缀',
    coverPrompt:
      '为一篇中文博客文章创作横向封面插画。\n文章标题：{{title}}\n文章摘要：{{excerpt}}\n视觉风格：{{style}}\n请提炼文章的核心概念，用具象物件与空间关系表达，避免通用机器人、发光大脑和杂乱科技符号。画面有一个明确视觉焦点，边缘保留裁切余量。不要出现文字、字母、数字、标志、水印。横向 3:2 构图，适合博客文章列表与分享封面。',
  },
  categories: [...new Set(writing.map((item) => item.category))].map(
    (name) => ({ id: categoryId(name), name, description: '', parentId: '' }),
  ),
  site: {
    name: '开发阿雷',
    mark: 'A',
    title: '开发阿雷 · 个人工作站',
    description: '写作、项目与持续生长的工作档案。',
    footer: '保持好奇，缓慢积累。',
    copyright: '© 2026 · 开发阿雷',
    footerLink: '保持联系 ↗',
    footerUrl: '/about#profile-contact',
    links: [
      { name: '写作', href: '/writing' },
      { name: '项目', href: '/projects' },
      { name: '说说', href: '/notes' },
      { name: 'AI', href: '/ai' },
      { name: '投资', href: '/investing' },
      { name: '关于', href: '/about' },
    ],
    sites: [
      { name: '书签', href: '/bookmarks' },
      { name: '友链', href: '/friends' },
    ],
    life: [
      { name: '音乐', href: '/music' },
      { name: '电影', href: '/films' },
      { name: '播客', href: '/podcasts' },
      { name: '旅行', href: '/travel' },
      { name: '爱好', href: '/hobbies' },
      { name: '书籍', href: '/books' },
    ],
  },
  home: {
    eyebrow: 'PERSONAL WORKSTATION / 2026',
    title: '思考、制作，\n并留下值得回看的东西。',
    description:
      '这里存放我的写作、项目与尚未成形的灵感。\n欢迎从最近的更新开始。',
    noteTitle: '不是所有内容都需要成为文章。',
    noteText:
      '说说记录正在形成的想法、值得再次查看的素材，以及尚未适合被归类的问题。',
  },
  writing: publish(
    writing.map((item) => ({
      ...stripArticleExtras(item),
      body: articleSeed,
      categoryId: categoryId(item.category),
      coverMode: 'upload',
      coverGeneratedFor: '',
    })),
  ),
  projects: migrateProjects(showcaseProjects),
  stories: publish(
    stories.map((item, index) => ({
      date: item.date,
      text: item.text,
      topics: [item.topic],
      id: `story-${index + 1}`,
      images:
        index === 0
          ? [
              { src: '/stories-lake.png', alt: '晨雾中的山湖' },
              { src: '/stories-coast.png', alt: '海岸悬崖步道' },
              { src: '/stories-stream.png', alt: '秋叶与溪流' },
            ]
          : ([] as { src: string; alt: string }[]),
    })),
  ),
  slides: publish([
    {
      id: 'slide-0',
      src: '/notes/paper-v2.png',
      title: '纸上远山',
      alt: 'AI 生成的纸艺山水与松林',
      width: 1881,
      height: 836,
      position: 'center 55%',
    },
    {
      id: 'slide-1',
      src: '/notes/rain-v2.png',
      title: '雨夜河畔',
      alt: 'AI 生成的胶片风格雨夜河畔',
      width: 1935,
      height: 813,
      position: 'center 60%',
    },
    {
      id: 'slide-2',
      src: '/notes/clay-v2.png',
      title: '柔软小世界',
      alt: 'AI 生成的黏土小屋与彩色树林',
      width: 1942,
      height: 809,
      position: 'center 60%',
    },
  ]),
  profile,
  ai: { agents: publish(aiAgents), skills: publish(aiSkills), relays: publish(aiRelays), skillCategories: [] as AiSkillCategory[] },
  investing: {
    ...researchContent.investing,
    sections: researchContent.investing.sections.map((section) => ({
      ...section,
      entries: publish(section.entries.map((entry, index) => ({
        ...entry,
        id: `${section.id}-${index + 1}`,
      }))),
    })),
  },
  bookmarks: migrateDirectory(bookmarks),
  friends: migrateDirectory(friends),
  books: migrateBooks(publish(books), publish(booklists)),
  tracks: migrateMusic(tracks),
  films: migrateFilms({
    ...lifeContent.films,
    entries: lifeContent.films.entries.map((item, index) => ({
      ...item,
      description: '虚构短片示例。' + item.description,
      image: [
        '/notes/city.png',
        '/notes/paper-v2.png',
        '/notes/coast.png',
        '/notes/rain-v2.png',
      ][index],
    })),
  }),
  podcasts: migratePodcasts({
    ...lifeContent.podcasts,
    entries: publish(lifeContent.podcasts.entries),
  }),
  travel: migrateActivities({ ...lifeContent.travel, entries: publish(lifeContent.travel.entries) }),
  hobbies: migrateActivities({ ...lifeContent.hobbies, entries: publish(lifeContent.hobbies.entries) }),
};
export type Content = typeof defaults;
export type PublicContent = Omit<Content, 'aiSettings'>;
export type Section = keyof Content;
export const sectionLabels: Record<Section, string> = {
  aiSettings: 'AI 大模型设置',
  site: '网站设置',
  home: '首页',
  writing: '写作',
  categories: '文章分类',
  projects: '项目',
  stories: '说说',
  slides: '说说封面',
  profile: '关于',
  ai: 'AI',
  investing: '投资',
  bookmarks: '书签',
  friends: '友链',
  books: '书籍',
  tracks: '音乐',
  films: '电影',
  podcasts: '播客',
  travel: '旅行',
  hobbies: '爱好',
};
