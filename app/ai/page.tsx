import { columnMetadata } from '@/lib/seo';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { AiNotebook } from '@/components/ai-notebook';
import { SectionContent } from '@/components/section-content';

export default function AiPage() {
  return (
    <SectionContent sections={['ai']}><main className="site-shell">
      <SiteHeader />
      <AiNotebook />
      <SiteFooter />
    </main></SectionContent>
  );
}

export function generateMetadata() { return columnMetadata('/ai'); }
