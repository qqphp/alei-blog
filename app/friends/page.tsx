import { columnMetadata } from '@/lib/seo';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { FriendDirectory } from '@/components/friend-directory';
import { SectionContent } from '@/components/section-content';
import '@/components/directory.css';

export default function FriendsPage() {
  return <SectionContent sections={['friends']}><main className="site-shell"><SiteHeader /><FriendDirectory /><SiteFooter /></main></SectionContent>;
}

export function generateMetadata() { return columnMetadata('/friends'); }
