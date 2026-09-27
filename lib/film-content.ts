import { categoryId } from './article-categories';
import type { LifeEntry } from './life-content';
export type Film = {
  id: string;
  title: string;
  director: string;
  genre: string;
  country: string;
  language: string;
  categoryId: string;
  cover: string;
  coverMode: 'upload' | 'ai';
  coverGeneratedFor: string;
  _published: boolean;
};
export type FilmDocument = {
  title: string;
  intro: string;
  items: Film[];
  categories: { id: string; name: string }[];
};
export const filmSample: FilmDocument = {
  title: '电影',
  intro: '留意画面里的光，也留意故事结束后的余味。',
  categories: [
    { id: 'recommended', name: '推荐榜' },
    { id: 'avoid', name: '劝退榜' },
  ],
  items: [
    {
      id: 'film',
      title: '电影',
      director: '',
      genre: '',
      country: '',
      language: '',
      categoryId: 'recommended',
      cover: '',
      coverMode: 'upload',
      coverGeneratedFor: '',
      _published: false,
    },
  ],
};
export function migrateFilms(
  document:
    | FilmDocument
    | {
        title: string;
        intro: string;
        entries: (LifeEntry & { _published?: boolean })[];
      },
): FilmDocument {
  if ('items' in document)
    return {
      ...document,
      items: document.items.map((film) => {
        const { description: _description, ...item } = film as Film & {
          description?: string;
        };
        return {
          ...item,
          coverGeneratedFor:
            item.coverGeneratedFor === filmCoverInput(item)
              ? item.coverGeneratedFor
              : '',
        };
      }),
    };
  const names = [...new Set(document.entries.map((item) => item.category.trim() || '未分类'))];
  return {
    title: document.title,
    intro: document.intro,
    categories: names.map((name) => ({ id: categoryId(name), name })),
    items: document.entries.map((item) => {
      const name = item.category.trim() || '未分类';
      return {
        ...filmSample.items[0],
        id: item.id,
        title: item.title,
        genre: '',
        categoryId: categoryId(name),
        cover: item.image ?? '',
        _published: item._published ?? true,
      };
    }),
  };
}
export const filmCoverInput = (film: Pick<Film, 'title' | 'director'>) =>
  JSON.stringify([film.title.trim(), film.director.trim(), '9:16']);
