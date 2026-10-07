import { columnMetadata } from '@/lib/seo';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { ResearchHub } from '@/components/research-hub';
import { SectionContent } from '@/components/section-content';

export default function InvestingPage() { return <SectionContent sections={['investing']}><main className="site-shell"><SiteHeader /><ResearchHub /><SiteFooter /></main></SectionContent>; }

export function generateMetadata() { return columnMetadata('/investing'); }
