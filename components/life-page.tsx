'use client';
import { ActivityLibrary } from '@/components/activity-library';

import { useContent } from '@/components/content-provider';


import { LifeNavigation, SiteFooter, SiteHeader } from '@/components/site-chrome';
import { PodcastLibrary } from '@/components/podcast-library';
import { FilmLibrary } from '@/components/film-library';
import { MusicLibrary } from '@/components/music-library';
import { LifePageHeader } from '@/components/life-page-header';
import { type LifeKind } from '@/lib/life-content';



export function LifePage({ type }: { type: LifeKind | 'music' }) {
  const content = useContent();
  const page = type === 'music' ? content.tracks : content[type];
  return <main className="site-shell"><SiteHeader /><div className="life-page"><LifePageHeader kind={type} title={page.title} intro={page.intro} /><LifeNavigation />{type === 'music' ? <MusicLibrary /> : type === 'films' ? <FilmLibrary /> : type === 'podcasts' ? <PodcastLibrary /> : <ActivityLibrary key={type} section={type} />}</div><SiteFooter /></main>;
}
