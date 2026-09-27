import { ContentProvider } from './content-provider';
import { getPublicContent } from '@/lib/cms-server';
import type { PublicContent } from '@/lib/cms-defaults';

export async function SectionContent({ sections, children }: {
  sections: (keyof PublicContent)[];
  children: React.ReactNode;
}) {
  const content = await getPublicContent(sections);
  return <ContentProvider content={content}>{children}</ContentProvider>;
}
