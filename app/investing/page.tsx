import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { ResearchHub } from '@/components/research-hub';
import { SectionContent } from '@/components/section-content';
export const metadata = { title: '投资研究 · 开发阿雷', description: '技术分析、技术指标、量化策略与投资分享。' };
export default function InvestingPage() { return <SectionContent sections={['investing']}><main className="site-shell"><SiteHeader /><ResearchHub /><SiteFooter /></main></SectionContent>; }
