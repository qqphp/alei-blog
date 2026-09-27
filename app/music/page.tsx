import { LifePage } from '@/components/life-page';
import { SectionContent } from '@/components/section-content';
export const metadata = { title: '音乐 · 开发阿雷' };
export default function MusicPage() {
  return <SectionContent sections={['tracks']}><LifePage type="music" /></SectionContent>;
}
