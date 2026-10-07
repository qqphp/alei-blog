import { columnMetadata } from '@/lib/seo';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { BookmarkDirectory } from '@/components/bookmark-directory';
import { SectionContent } from '@/components/section-content';
import '@/components/directory.css';

export default function BookmarksPage() {
  return <SectionContent sections={['bookmarks']}><main className="site-shell"><SiteHeader /><BookmarkDirectory /><SiteFooter /></main></SectionContent>;
}

export function generateMetadata() { return columnMetadata('/bookmarks'); }
