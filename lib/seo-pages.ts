import { cacheForRequest } from 'vinext/cache';
import { getWritingArchive } from './cms-server';
import { getPublicSection } from './public-records';
import { defaults } from './cms-defaults';
import { withReadDatabase } from './postgres';
import { recordTimes } from './content-times';
import type { Project } from './project-content';
import { contentPageSizes } from './content-page-sizes';

const writingRequests = cacheForRequest(() => new Map<string, ReturnType<typeof getWritingArchive>>());
export function writingPageData(q: string, group: string, page: number) {
  const key = JSON.stringify([q, group, page]);
  const requests = writingRequests();
  if (!requests.has(key)) requests.set(key, getWritingArchive(q, group, page));
  return requests.get(key)!;
}

async function loadProject(id: string) {
  return withReadDatabase(async (db) => {
    const result = await db.query<{ payload: Project; createdAt: Date | null; updatedAt: Date }>(
      `SELECT payload, created_at AS "createdAt", updated_at AS "updatedAt" FROM cms_entries
       WHERE section='projects' AND collection='items' AND id=$1 AND published`, [id]);
    if (result.rows[0]) {
      const row = result.rows[0];
      return { ...row.payload, ...recordTimes(row), createdAt: recordTimes(row).createdAt ?? '' };
    }
    const saved = await db.query("SELECT 1 FROM cms_sections WHERE section='projects'");
    return saved.rowCount ? undefined : defaults.projects.items.find((item) => item.id === id && item._published);
  });
}
async function loadProjectsPage(project: string, category: string, page: number, hasPage: boolean) {
  const selectedProject = project ? await loadProject(project) : undefined;
  const data = await getPublicSection(['projects'], project && !category && !hasPage ? project : undefined, { category, page });
  const archive = data.archives['projects.items'];
  if (!archive) {
    const all = data.content.projects!.items;
    const items = all.filter((item) => !category || item.categoryId === category);
    const index = project && !hasPage && !category ? items.findIndex((item) => item.id === project) : -1;
    const size = contentPageSizes.projects;
    const currentPage = Math.min(index >= 0 ? Math.floor(index / size) + 1 : page, Math.max(1, Math.ceil(items.length / size)));
    data.content.projects!.items = items.slice((currentPage - 1) * size, currentPage * size);
    data.archives['projects.items'] = { items: data.content.projects!.items, page: currentPage, total: items.length,
      allCount: all.length, searchTotal: all.length, categoryCounts: Object.fromEntries(data.content.projects!.categories.map((option) => [option.id, all.filter((item) => item.categoryId === option.id).length])) };
  }
  return { ...data, selectedProject };
}
const projectRequests = cacheForRequest(() => new Map<string, ReturnType<typeof loadProjectsPage>>());
export function projectsPageData(project: string, category: string, page: number, hasPage: boolean) {
  const key = JSON.stringify([project, category, page, hasPage]);
  const requests = projectRequests();
  if (!requests.has(key)) requests.set(key, loadProjectsPage(project, category, page, hasPage));
  return requests.get(key)!;
}
