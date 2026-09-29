import { defaults, type Section } from './cms-defaults';

export const adminCollections: Partial<Record<Section, readonly string[]>> = {
  writing: ['articles', 'categories'],
  projects: ['items', 'statuses', 'categories'],
  stories: ['root'],
  slides: ['root'],
  ai: ['agents', 'skills', 'relays', 'agentStatuses', 'skillCategories'],
  investing: ['entries', 'sections'],
  bookmarks: ['items', 'categories'],
  friends: ['items', 'categories'],
  books: ['items', 'categories', 'lists'],
  tracks: ['items', 'scenes', 'playlists'],
  films: ['items', 'categories'],
  podcasts: ['items', 'categories'],
  travel: ['items', 'categories'],
  hobbies: ['items', 'categories'],
};

export const collectionLabels: Record<string, string> = {
  articles: '文章', categories: '分类', items: '内容', statuses: '状态',
  root: '内容', sections: '栏目', entries: '文章', lists: '书单',
  agents: '智能体', skills: '技能 Skills', relays: '中转站 API', agentStatuses: '智能体状态', skillCategories: 'Skills分类',
  scenes: '音乐场景', playlists: '歌单',
};

export function configScopes(section: Section) {
  if (['ai', 'investing', 'films', 'tracks', 'podcasts', 'travel', 'hobbies'].includes(section)) return [];
  const value = defaults[section];
  const collections = adminCollections[section] ?? [];
  const metadata = value && typeof value === 'object' && !Array.isArray(value)
    ? Object.keys(value).filter((key) => !collections.includes(key)) : [];
  return !collections.length || metadata.length ? [{ id: 'root', label: '设置' }] : [];
}

export function sectionMetadata(section: Section): Record<string, unknown> {
  const value = defaults[section];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const collections = adminCollections[section] ?? [];
  return Object.fromEntries(Object.entries(value).filter(([key]) => !collections.includes(key)));
}

export function configKeys(section: Section, scope: string): readonly string[] | null {
  if (scope !== 'root' || !configScopes(section).length) return null;
  return Object.keys(sectionMetadata(section));
}

export function validCollection(section: Section, collection: string) {
  return adminCollections[section]?.includes(collection) ?? false;
}
