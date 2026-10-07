import { columnMetadata } from '@/lib/seo';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { AboutProfile } from '@/components/about-profile';
import { SectionContent } from '@/components/section-content';



export default function AboutPage() {
  return <SectionContent sections={['profile']}><main className="site-shell"><SiteHeader /><AboutProfile /><SiteFooter /></main></SectionContent>;
}

export function generateMetadata() { return columnMetadata('/about'); }
