import { ProjectShowcase } from '@/components/project-showcase';
import { ContentProvider } from '@/components/content-provider';
import { projectsPageData } from '@/lib/seo-pages';
import { columnMetadata, pageMetadata, breadcrumbData } from '@/lib/seo';
import { automaticDescription, listUrl, requestedPage, pageNeedsRedirect } from '@/lib/seo-text';
import { getPublicContent } from '@/lib/cms-server';
import { notFound, redirect } from 'next/navigation';
import { JsonLd } from '@/components/json-ld';

type Props = { searchParams: Promise<{ project?: string; category?: string; page?: string }> };
export async function generateMetadata({ searchParams }: Props) {
  const { project = '', category = '', page } = await searchParams;
  const data = await projectsPageData(project, category, requestedPage(page), page !== undefined);
  if (project) {
    if (!data.selectedProject) notFound();
    const { site } = await getPublicContent(['site']);
    return pageMetadata(site, { title: data.selectedProject.title, description: automaticDescription(data.selectedProject.description || data.selectedProject.subtitle),
      path: listUrl('/projects', { project }), image: data.selectedProject.images[0]?.src, imageAlt: data.selectedProject.images[0]?.alt });
  }
  return columnMetadata('/projects', { path: listUrl('/projects', { category, page: requestedPage(page) }), page: requestedPage(page), noindex: Boolean(category) });
}
export default async function ProjectsPage({ searchParams }: Props) {
  const { project = '', category = '', page } = await searchParams;
  const current = requestedPage(page);
  const { content, archives, selectedProject } = await projectsPageData(project, category, current, page !== undefined);
  if (project && !selectedProject) notFound();
  const archive = archives['projects.items']!;
  if (pageNeedsRedirect(page, archive.page))
    redirect(listUrl('/projects', { project, category, page: archive.page }));
  const initialId = selectedProject?.id ?? content.projects!.items[0]?.id ?? '';
  return <>
    {selectedProject && <JsonLd value={breadcrumbData([{ name: '首页', path: '/' }, { name: '项目', path: '/projects' }, { name: selectedProject.title, path: listUrl('/projects', { project }) }])} />}
    <ContentProvider content={{ projects: content.projects! }} archives={archives}>
      <ProjectShowcase key={JSON.stringify([project, category, archive.page])} initialId={initialId} selectedProject={selectedProject}
        route={{ category, page: archive.page }} />
    </ContentProvider>
  </>;
}
