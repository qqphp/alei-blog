import { categoryId } from './article-categories';
import type { LifeEntry } from './life-content';
export type Activity = {
  id: string;
  title: string;
  categoryId: string;
  description: string;
  body: string;
  cover: string;
  coverDescription: string;
  album: string[];
  _published: boolean;
};
export type ActivityDocument = {
  title: string;
  intro: string;
  categories: { id: string; name: string }[];
  items: Activity[];
};
export const activitySample: ActivityDocument = {
  title: '生活',
  intro: '',
  categories: [{ id: 'uncategorized', name: '未分类' }],
  items: [
    {
      id: 'activity',
      title: '记录',
      categoryId: 'uncategorized',
      description: '',
      body: '',
      cover: '',
      coverDescription: '',
      album: [],
      _published: false,
    },
  ],
};
export function migrateActivities(
  doc:
    | ActivityDocument
    | {
        title: string;
        intro: string;
        entries: (LifeEntry & { _published?: boolean })[];
      },
): ActivityDocument {
  if ('items' in doc)
    return {
      ...doc,
      items: doc.items.map((item) => ({ ...item, coverDescription: item.coverDescription ?? '', album: item.album ?? [] })),
    };
  const names = [
    ...new Set(doc.entries.map((item) => item.category.trim() || '未分类')),
  ];
  return {
    title: doc.title,
    intro: doc.intro,
    categories: names.map((name) => ({ id: categoryId(name), name })),
    items: doc.entries.map((item) => ({
      ...activitySample.items[0],
      id: item.id,
      title: item.title,
      categoryId: categoryId(item.category.trim() || '未分类'),
      description: item.description ?? '',
      body: (item.body ?? []).join('\n\n'),
      cover: item.image ?? '',
      coverDescription: '',
      _published: item._published ?? true,
    })),
  };
}
