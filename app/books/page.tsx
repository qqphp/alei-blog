import { columnMetadata } from '@/lib/seo';
import { Bookshelf } from '@/components/bookshelf';
import { SectionContent } from '@/components/section-content';

export default function BooksPage() { return <SectionContent sections={['books']}><Bookshelf /></SectionContent>; }

export function generateMetadata() { return columnMetadata('/books'); }
