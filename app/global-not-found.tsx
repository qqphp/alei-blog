import { NotFoundPage } from '@/components/not-found-page';
import { themePreferenceScript } from '@/lib/site-theme';

export const metadata = { title: '404 · 页面走失', robots: { index: false, follow: false } };

export default function GlobalNotFound() {
  return <html lang="zh-CN" suppressHydrationWarning><head>
    <script dangerouslySetInnerHTML={{ __html: themePreferenceScript }} />
  </head><body className="missing-document"><NotFoundPage /></body></html>;
}
