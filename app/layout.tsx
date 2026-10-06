import { getPublicContent, getPublicPlaybackContent } from '@/lib/cms-server';
import { ContentProvider } from '@/components/content-provider';
import Script from 'next/script';
import './globals.css';
import { MusicProvider } from '@/components/music-player';
import '@/components/life.css';
import { themePreferenceScript } from '@/lib/site-theme';

export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  const { site } = await getPublicContent(['site']);
  return { title: site.title, description: site.description, icons: { icon: '/favicon.ico' } };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [content, tracks] = await Promise.all([getPublicContent(['site']),getPublicPlaybackContent()]);
  return <html lang="zh-CN" suppressHydrationWarning><head><Script id="theme-preference" strategy="beforeInteractive">{themePreferenceScript}</Script></head><body><ContentProvider content={{...content,tracks}}><MusicProvider>{children}</MusicProvider></ContentProvider></body></html>;
}
