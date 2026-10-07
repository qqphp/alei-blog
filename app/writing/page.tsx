import WritingRoutePage from '@/components/writing-route-page';
import { writingPageData } from '@/lib/seo-pages';
import { columnMetadata } from '@/lib/seo';
import { listUrl, requestedPage, pageNeedsRedirect } from '@/lib/seo-text';
import { redirect } from 'next/navigation';

type Props = { searchParams: Promise<{ page?: string; group?: string; q?: string }> };
export async function generateMetadata({ searchParams }: Props) {
  const { page, group = '', q = '' } = await searchParams;
  const current = requestedPage(page);
  return columnMetadata('/writing', { path: listUrl('/writing', { page: current, group, q }), page: current, noindex: Boolean(group || q) });
}
export default async function WritingPage({ searchParams }: Props) {
  const { page, group = '', q = '' } = await searchParams;
  const current = requestedPage(page);
  const initial = await writingPageData(q, group, current);
  if (pageNeedsRedirect(page, initial.page ?? 1)) redirect(listUrl('/writing', { q, group, page: initial.page }));
  return <WritingRoutePage key={JSON.stringify([q, group, current])} initial={initial} route={{ q, group, page: current }} />;
}
