'use client';
import { type MusicPlaylist } from '@/lib/music-content';
import { api } from './admin-fields';

export async function createPlaylistCover(
  list: MusicPlaylist,
): Promise<MusicPlaylist> {
  const result = await api<{ url: string; generatedFor: string }>(
    '/api/admin/ai',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'playlist-cover',
        title: list.title,
        excerpt: list.description,
      }),
    },
  );
  return { ...list, cover: result.url, coverGeneratedFor: result.generatedFor };
}
