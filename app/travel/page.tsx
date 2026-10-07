import { columnMetadata } from '@/lib/seo';
import { LifePage } from '@/components/life-page';
import { SectionContent } from '@/components/section-content';

export default function TravelPage() { return <SectionContent sections={['travel']}><LifePage type="travel" /></SectionContent>; }

export function generateMetadata() { return columnMetadata('/travel'); }
