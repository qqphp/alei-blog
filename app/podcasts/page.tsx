import { columnMetadata } from '@/lib/seo';
import { LifePage } from '@/components/life-page';
import { SectionContent } from '@/components/section-content';

export default function PodcastsPage() { return <SectionContent sections={['podcasts']}><LifePage type="podcasts" /></SectionContent>; }

export function generateMetadata() { return columnMetadata('/podcasts'); }
