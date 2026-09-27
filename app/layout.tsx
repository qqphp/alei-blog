import { getPublicContent } from '@/lib/cms-server';
import { ContentProvider } from '@/components/content-provider';
import Script from 'next/script';
import './globals.css';
import { MusicProvider } from '@/components/music-player';
import '@/components/life.css';

export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  const { site } = await getPublicContent(['site', 'tracks']);
  return { title: site.title, description: site.description, icons: { icon: '/favicon.ico' } };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const content = await getPublicContent(['site', 'tracks']);
  return <html lang="zh-CN" suppressHydrationWarning><head><Script id="theme-preference" strategy="beforeInteractive">{`try { if (localStorage.getItem('site-theme') === 'fresh') document.documentElement.classList.add('fresh-theme'); } catch (_) {}`}</Script></head><body><ContentProvider content={content}><MusicProvider>{children}</MusicProvider></ContentProvider></body></html>;
}
