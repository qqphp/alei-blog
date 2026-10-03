'use client';
import { useEffect, useRef, useState } from 'react';
import { usePublicArchives } from './content-provider';
import {
  publicCollectionSizes,
  type PublicCollectionKey,
  type PublicPage,
} from '@/lib/public-collections';

export function usePublicCollection<T extends { id: string }>(
  key: PublicCollectionKey,
  fallback: T[],
  page: number,
  input: {
    q?: string;
    category?: string;
    accumulate?: boolean;
    enabled?: boolean;
    onPageChange?: (page: number) => void;
  } = {},
) {
  const initial = usePublicArchives()[key] as PublicPage<T> | undefined;
  const [archive, setArchive] = useState(initial);
  const [error, setError] = useState('');
  const q = input.q ?? '';
  const category = input.category ?? '';
  const requestKey = `${page}|${q}|${category}`;
  const lastRequest = useRef(initial ? `${initial.page}||` : '');
  const previousFilter = useRef('|');
  const onPageChange = useRef(input.onPageChange);
  useEffect(() => {
    onPageChange.current = input.onPageChange;
  }, [input.onPageChange]);
  const accumulate = input.accumulate ?? false;
  const enabled = input.enabled ?? true;
  useEffect(() => {
    if (!initial || !enabled || lastRequest.current === requestKey) return;
    const controller = new AbortController();
    const timer = setTimeout(
      async () => {
        try {
          const params = new URLSearchParams({
            page: String(page),
            q,
            category,
          });
          const response = await fetch(
            `/api/public/${key.replace('.', '/')}?${params}`,
            { signal: controller.signal },
          );
          if (!response.ok) throw new Error('读取内容失败，请稍后重试。');
          const result = (await response.json()) as PublicPage<T>;
          if (controller.signal.aborted) return;
          const filter = `${q}|${category}`;
          const append =
            accumulate &&
            page > 1 &&
            result.page === page &&
            previousFilter.current === filter;
          setArchive((old) =>
            append && old
              ? {
                  ...result,
                  items: [
                    ...new Map(
                      [...old.items, ...result.items].map((item) => [
                        item.id,
                        item,
                      ]),
                    ).values(),
                  ],
                }
              : result,
          );
          previousFilter.current = filter;
          lastRequest.current = requestKey;
          setError('');
          if (result.page !== page) onPageChange.current?.(result.page);
        } catch (reason) {
          if (!controller.signal.aborted)
            setError(reason instanceof Error ? reason.message : '读取内容失败');
        }
      },
      q ? 200 : 0,
    );
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [initial, enabled, requestKey, key, page, q, category, accumulate]);
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(fallback.length / publicCollectionSizes[key])),
  );
  return {
    ...(initial && archive
      ? archive
      : {
          items: fallback.slice(
            (currentPage - 1) * publicCollectionSizes[key],
            currentPage * publicCollectionSizes[key],
          ),
          total: fallback.length,
          allCount: fallback.length,
          searchTotal: fallback.length,
          categoryCounts: {},
          page: currentPage,
        }),
    currentPage: initial && archive ? archive.page : currentPage,
    remote: Boolean(initial),
    error,
  };
}
