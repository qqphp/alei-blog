import { ProjectShowcase } from '@/components/project-showcase';
import { getPublicSection } from '@/lib/public-records';
import { ContentProvider } from '@/components/content-provider';

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project } = await searchParams;
  const { content, archives } = await getPublicSection(['projects'],project);
  const showcaseProjects = content.projects!;
  const projects = showcaseProjects.items;
  const initialId =
    projects.find((item) => item.id === project)?.id ?? projects[0]?.id ?? '';
  return <ContentProvider content={{ projects: showcaseProjects }} archives={archives}><ProjectShowcase key={initialId} initialId={initialId} /></ContentProvider>;
}
