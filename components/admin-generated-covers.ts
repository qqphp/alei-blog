'use client';

import type { Film } from '@/lib/film-content';
import type { Podcast } from '@/lib/podcast-content';
import { api } from './admin-fields';

export async function createFilmCover(film: Film): Promise<Film> {
  const result = await api<{ url: string; generatedFor: string }>('/api/admin/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'film-cover',
      title: film.title,
      director: film.director,
    }),
  });
  return { ...film, cover: result.url, coverGeneratedFor: result.generatedFor };
}

export async function createPodcastCover(podcast: Podcast): Promise<Podcast> {
  const result = await api<{ url: string; generatedFor: string }>('/api/admin/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'podcast-cover',
      title: podcast.title,
      host: podcast.host,
      excerpt: podcast.description,
    }),
  });
  return { ...podcast, cover: result.url, coverGeneratedFor: result.generatedFor };
}
