'use client';
import { ActivityLibrary } from '@/components/activity-library';

import { LifeNavigation, SiteFooter, SiteHeader } from '@/components/site-chrome';
import { PodcastLibrary } from '@/components/podcast-library';
import { FilmLibrary } from '@/components/film-library';
import { MusicLibrary } from '@/components/music-library';
import { LifePageHeader } from '@/components/life-page-header';
import { type LifeKind } from '@/lib/life-content';



export function LifePage({ type }: { type: LifeKind | 'music' }) {
  const copy = {
    music: { title: '音乐', intro: '声音是日常的另一种时间线。' },
    films: { title: '电影', intro: '留意画面里的光，也留意故事结束后的余味。' },
    podcasts: { title: '播客', intro: '给一个问题留足时间，也给不同的声音留一个座位。' },
    travel: { title: '旅行', intro: '把目的地留给地图，把沿途留给自己。' },
    hobbies: { title: '爱好', intro: '有些事不需要变得擅长，只要愿意一次次开始。' },
  }[type];
  return <main className="site-shell"><SiteHeader /><div className="life-page"><LifePageHeader kind={type} title={copy.title} intro={copy.intro} /><LifeNavigation />{type === 'music' ? <MusicLibrary /> : type === 'films' ? <FilmLibrary /> : type === 'podcasts' ? <PodcastLibrary /> : <ActivityLibrary key={type} section={type} />}</div><SiteFooter /></main>;
}
