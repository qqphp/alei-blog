'use client';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import WritingArchivePage from './writing-archive-page';
import type { WritingArchive } from '@/lib/cms-server';
import type { Content } from '@/lib/cms-defaults';
import { listUrl } from '@/lib/seo-text';

export default function WritingRoutePage({ initial, route }: {
  initial: WritingArchive & { categories: Content['categories'] };
  route: { group: string; q: string; page: number };
}) {
  const router = useRouter();
  const onSearch = useCallback((q: string) => router.replace(listUrl('/writing', { q, group: route.group }), { scroll: false }), [router, route.group]);
  return <WritingArchivePage initial={initial} route={route} onSearch={onSearch} />;
}
