import { categoryId } from './article-categories';
import type { books, booklists } from './books';
export type Book = {
  id: string;
  title: string;
  author: string;
  categoryId: string;
  note: string;
  cover: string;
  coverDescription: string;
  _published: boolean;
};
export type BookList = {
  id: string;
  title: string;
  description: string;
  entries: { title: string; author: string }[];
  cover: string;
  coverDescription: string;
  _published: boolean;
};
export type BookDocument = {
  items: Book[];
  categories: { id: string; name: string }[];
  lists: BookList[];
};
export const bookSample: BookDocument = {
  categories: [{ id: 'uncategorized', name: '未分类' }],
  items: [
    {
      id: 'book',
      title: '书籍',
      author: '',
      categoryId: 'uncategorized',
      note: '',
      cover: '',
      coverDescription: '',
      _published: false,
    },
  ],
  lists: [
    {
      id: 'list',
      title: '书单',
      description: '',
      entries: [{ title: '书名', author: '' }],
      cover: '',
      coverDescription: '',
      _published: false,
    },
  ],
};
export function migrateBooks(
  value:
    | BookDocument
    | (Omit<BookDocument, 'lists'> & {
        lists: (Omit<BookList, 'entries' | 'cover' | 'coverDescription'> & { ids: string[] })[];
      })
    | ((typeof books)[number] & { _published?: boolean })[],
  lists: ((typeof booklists)[number] & { _published?: boolean })[] = [],
): BookDocument {
  if (!Array.isArray(value))
    return {
      ...value,
      items: value.items.map((item) => {
        const { status: _status, ...book } = item as Book & { status?: string };
        return { ...book, coverDescription: book.coverDescription ?? '' };
      }),
      lists: value.lists.map((list) => {
        if ('entries' in list) return { ...list, coverDescription: list.coverDescription ?? '' };
        return {
          id: list.id,
          title: list.title,
          description: list.description,
          cover: '',
          coverDescription: '',
          entries: list.ids.flatMap((id) => {
            const book = value.items.find((item) => item.id === id);
            return book && (!list._published || book._published)
              ? [{ title: book.title, author: book.author }]
              : [];
          }),
          _published: list._published,
        };
      }),
    };
  const names = [
    ...new Set(value.map((item) => item.category.trim() || '未分类')),
  ];
  return {
    categories: names.map((name) => ({ id: categoryId(name), name })),
    items: value.map((item) => ({
      ...bookSample.items[0],
      id: item.id,
      title: item.title,
      author: item.author,
      categoryId: categoryId(item.category.trim() || '未分类'),
      note: item.note,
      coverDescription: '',
      _published: item._published ?? true,
    })),
    lists: lists.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      cover: '',
      coverDescription: '',
      entries: [...new Set(item.ids)].flatMap((id) => {
        const book = value.find((book) => book.id === id);
        return book && (item._published === false || book._published !== false)
          ? [{ title: book.title, author: book.author }]
          : [];
      }),
      _published: item._published ?? true,
    })),
  };
}
