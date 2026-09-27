import { categoryId } from './article-categories';
import type { LifeEntry } from './life-content';

export type Podcast = {
  id: string;
  title: string;
  description: string;
  host: string;
  categoryId: string;
  audio: string;
  cover: string;
  coverMode: 'upload' | 'ai';
  coverGeneratedFor: string;
  _published: boolean;
};
export type PodcastDocument = {
  title: string;
  intro: string;
  items: Podcast[];
  categories: { id: string; name: string }[];
};
export const podcastSample: PodcastDocument = {
  title: '播客',
  intro: '',
  categories: [{ id: 'uncategorized', name: '未分类' }],
  items: [
    {
      id: 'podcast',
      title: '播客',
      description: '',
      host: '',
      categoryId: 'uncategorized',
      audio: '',
      cover: '',
      coverMode: 'upload',
      coverGeneratedFor: '',
      _published: false,
    },
  ],
};
export function migratePodcasts(
  document:
    | PodcastDocument
    | {
        title: string;
        intro: string;
        entries: (LifeEntry & { _published?: boolean })[];
      },
): PodcastDocument {
  if ('items' in document) return document;
  const names = [
    ...new Set(
      document.entries.map((item) => item.category.trim() || '未分类'),
    ),
  ];
  return {
    title: document.title,
    intro: document.intro,
    categories: names.map((name) => ({ id: categoryId(name), name })),
    items: document.entries.map((item) => ({
      ...podcastSample.items[0],
      id: item.id,
      title: item.title,
      description: item.description ?? '',
      categoryId: categoryId(item.category.trim() || '未分类'),
      cover: item.image ?? '',
      _published: item._published ?? true,
    })),
  };
}
export const podcastCoverInput = (
  item: Pick<Podcast, 'title' | 'description' | 'host'>,
) =>
  JSON.stringify([
    item.title.trim(),
    item.description.trim(),
    item.host.trim(),
    '3:2',
  ]);
