export const publicCollectionSizes = {
  'ai.agents': 9,
  'ai.skills': 9,
  'ai.relays': 9,
  'investing.entries': 9,
  'projects.items': 6,
  'books.items': 12,
  'books.lists': 6,
  'tracks.items': 25,
  'tracks.playlists': 12,
  'films.items': 20,
  'podcasts.items': 12,
  'travel.items': 12,
  'hobbies.items': 12,
  'bookmarks.items': 24,
  'friends.items': 24,
} as const;

export type PublicCollectionKey = keyof typeof publicCollectionSizes;
export type PublicPage<T = Record<string, unknown>> = {
  items: T[];
  total: number;
  allCount: number;
  searchTotal: number;
  categoryCounts: Record<string, number>;
  page: number;
};
export type PublicArchives = Partial<Record<PublicCollectionKey, PublicPage>>;
