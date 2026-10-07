import { columnMetadata } from '@/lib/seo';
import StoriesPage from '@/components/stories-page';
import { getStoryArchive } from '@/lib/cms-server';

export default async function NotesPage() {
  return <StoriesPage initial={await getStoryArchive()} />;
}

export function generateMetadata() { return columnMetadata('/notes'); }
