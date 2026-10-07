import { columnMetadata } from '@/lib/seo';
import { LifePage } from '@/components/life-page';
import { SectionContent } from '@/components/section-content';

export default function MusicPage() {
  return <SectionContent sections={['tracks']}><LifePage type="music" /></SectionContent>;
}

export function generateMetadata() { return columnMetadata('/music'); }
