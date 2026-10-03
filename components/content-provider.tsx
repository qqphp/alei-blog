'use client';
import { createContext, useContext } from 'react';
import type { PublicContent as Content } from '@/lib/cms-defaults';
import type { PublicArchives } from '@/lib/public-collections';

const ContentContext = createContext<Content | null>(null);
const ArchiveContext = createContext<PublicArchives>({});
export const usePublicArchives = () => useContext(ArchiveContext);
export function ContentProvider({
  content,
  children,
  archives,
}: {
  content: Partial<Content>;
  children: React.ReactNode;
  archives?: PublicArchives;
}) {
  const parent = useContext(ContentContext);
  const parentArchives = useContext(ArchiveContext);
  return (
    <ContentContext.Provider value={{ ...parent, ...content } as Content}>
      <ArchiveContext.Provider value={archives ? { ...parentArchives, ...archives } : parentArchives}>
      {children}
      </ArchiveContext.Provider>
    </ContentContext.Provider>
  );
}
export function useContent() {
  const content = useContext(ContentContext);
  if (!content) throw new Error('ContentProvider is required');
  return content;
}
