import { columnMetadata } from '@/lib/seo';
import { LifePage } from '@/components/life-page';
import { SectionContent } from '@/components/section-content';

export default function FilmsPage() { return <SectionContent sections={['films']}><LifePage type="films" /></SectionContent>; }

export function generateMetadata() { return columnMetadata('/films'); }
