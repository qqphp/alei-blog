import { columnMetadata } from '@/lib/seo';
import { LifePage } from '@/components/life-page';
import { SectionContent } from '@/components/section-content';

export default function HobbiesPage() { return <SectionContent sections={['hobbies']}><LifePage type="hobbies" /></SectionContent>; }

export function generateMetadata() { return columnMetadata('/hobbies'); }
