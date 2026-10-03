import { ContentProvider } from './content-provider';
import { getPublicContent } from '@/lib/cms-server';
import { getPublicSection } from '@/lib/public-records';
import { publicCollectionSizes } from '@/lib/public-collections';
import type { PublicContent } from '@/lib/cms-defaults';

export async function SectionContent({ sections, children }: {
  sections: (keyof PublicContent)[];
  children: React.ReactNode;
}) {
  if (sections.some((section) => Object.keys(publicCollectionSizes).some((key) => key.startsWith(`${section}.`)))) {
    const { content, archives } = await getPublicSection(sections);
    return <ContentProvider content={content} archives={archives}>{children}</ContentProvider>;
  }
  return <ContentProvider content={await getPublicContent(sections)}>{children}</ContentProvider>;
}
