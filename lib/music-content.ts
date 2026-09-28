import { categoryId } from './article-categories';
export type MusicTrack = {
  id: string;
  title: string;
  artist: string;
  src: string;
  duration: number;
  moodId: string;
  mood: string;
  _published: boolean;
};
export type MusicPlaylist = {
  id: string;
  title: string;
  description: string;
  cover: string;
  coverDescription: string;
  color: string;
  coverMode: 'upload' | 'ai';
  coverGeneratedFor: string;
  songs: { title: string; artist: string }[];
  _published: boolean;
};
export const musicPageCopy = {
  title: '音乐',
  intro: '声音是日常的另一种时间线。',
};
export type MusicDocument = {
  title: string;
  intro: string;
  items: MusicTrack[];
  playlists: MusicPlaylist[];
  scenes: { id: string; name: string }[];
};
export const musicSample: MusicDocument = {
  title: musicPageCopy.title,
  intro: musicPageCopy.intro,
  items: [
    {
      id: 'track',
      title: '音乐',
      artist: '',
      src: '/audio/blue-hour.wav',
      duration: 48,
      moodId: 'scene',
      mood: '场景',
      _published: false,
    },
  ],
  playlists: [
    {
      id: 'playlist',
      title: '歌单',
      description: '',
      cover: '',
      coverDescription: '',
      color: '#91b8a5',
      coverMode: 'upload',
      coverGeneratedFor: '',
      songs: [{ title: '歌曲', artist: '' }],
      _published: false,
    },
  ],
  scenes: [{ id: 'scene', name: '场景' }],
};
type LegacyTrack = Omit<MusicTrack, '_published' | 'moodId'> & {
  _published?: boolean;
  moodId?: string;
  note?: string;
};
type LegacyPlaylist = Omit<
  MusicPlaylist,
  'songs' | 'coverMode' | 'coverGeneratedFor'
> & {
  songs?: MusicPlaylist['songs'];
  trackIds?: string[];
  coverMode?: MusicPlaylist['coverMode'];
  coverGeneratedFor?: string;
};
export function migrateMusic(
  input:
    | LegacyTrack[]
    | {
        title?: string;
        intro?: string;
        items: LegacyTrack[];
        playlists: LegacyPlaylist[];
        scenes?: MusicDocument['scenes'];
      },
): MusicDocument {
  const document: {
    title?: string;
    intro?: string;
    items: LegacyTrack[];
    playlists: LegacyPlaylist[];
    scenes?: MusicDocument['scenes'];
  } = Array.isArray(input) ? { items: input, playlists: [] } : input;
  const scenes =
    document.scenes ??
    [
      ...new Set(document.items.map((item) => item.mood.trim() || '未分类')),
    ].map((name) => ({ id: categoryId(name), name }));
  return {
    title: document.title?.trim() ? document.title : musicPageCopy.title,
    intro: typeof document.intro === 'string' ? document.intro : musicPageCopy.intro,
    scenes,
    items: document.items.map(({ note: _note, ...item }) => {
      const moodId = item.moodId ?? categoryId(item.mood.trim() || '未分类');
      return {
        ...item,
        moodId,
        mood: scenes.find((scene) => scene.id === moodId)?.name ?? item.mood,
        _published: item._published ?? true,
      };
    }),
    playlists: document.playlists.map(({ trackIds, ...list }) => ({
      ...list,
      coverDescription: list.coverDescription ?? '',
      coverMode: list.coverMode ?? 'upload',
      coverGeneratedFor: list.coverGeneratedFor ?? '',
      songs:
        list.songs ??
        (trackIds ?? []).flatMap((id) => {
          const track = document.items.find((item) => item.id === id);
          // Previously published playlists did not expose draft tracks.
          return track &&
            (list._published === false || track._published !== false)
            ? [{ title: track.title, artist: track.artist }]
            : [];
        }),
    })),
  };
}

export function publicMusic(document: MusicDocument): MusicDocument {
  return {
    ...document,
    title: document.title?.trim() ? document.title : musicPageCopy.title,
    intro: typeof document.intro === 'string' ? document.intro : musicPageCopy.intro,
    items: document.items.filter((item) => item._published !== false),
    playlists: document.playlists.filter((item) => item._published !== false),
  };
}
