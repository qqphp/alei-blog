import { NotFoundPage } from '@/components/not-found-page';
export const metadata = { title: '页面未找到', robots: { index: false, follow: false } };

export default function NotFound() {
  return <NotFoundPage />;
}
