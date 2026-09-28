import { categoryId } from './article-categories';

export type ProjectOption = { id: string; name: string };
export type ProjectImage = {
  src: string;
  label: string;
  alt: string;
  mode: string;
  generatedFor: string;
};
export type Project = {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  statusId: string;
  category: string;
  categoryId: string;
  year: string;
  createdAt: string;
  url: string;
  description: string;
  body: string;
  images: ProjectImage[];
  tags: string[];
  _published: boolean;
};
export type ProjectDocument = {
  items: Project[];
  statuses: ProjectOption[];
  categories: ProjectOption[];
};
type LegacyProject = Omit<
  Project,
  'statusId' | 'categoryId' | 'body' | '_published' | 'images' | 'createdAt'
> &
  Partial<Pick<Project, 'body' | '_published' | 'createdAt'>> & {
    role?: string;
    images: { src: string; label: string; alt: string }[];
  };
export function migrateProjects(items: LegacyProject[]): ProjectDocument {
  const options = (key: 'status' | 'category') =>
    [...new Set(items.map((item) => item[key]).filter(Boolean))].map(
      (name) => ({ id: categoryId(name), name }),
    );
  return {
    statuses: options('status'),
    categories: options('category'),
    items: items.map((item) => ({
      id: item.id,
      title: item.title,
      subtitle: item.subtitle,
      status: item.status,
      statusId: categoryId(item.status),
      category: item.category,
      categoryId: categoryId(item.category),
      year: item.year,
      createdAt: item.createdAt ?? '',
      url: item.url ?? '',
      description: item.description,
      body: item.body ?? '',
      images: item.images.map((image) => ({
        ...image,
        mode: 'upload',
        generatedFor: '',
      })),
      tags: item.tags,
      _published: item._published ?? true,
    })),
  };
}
export function resolveProjects(document: ProjectDocument): ProjectDocument {
  return {
    ...document,
    items: document.items.map((item) => {
      const normalized = { ...item } as Project & { role?: string };
      delete normalized.role;
      return {
        ...normalized,
        createdAt: normalized.createdAt ?? '',
        url: normalized.url ?? '',
        images: normalized.images.map((image) => ({
          ...image,
          mode: image.mode ?? 'upload',
          generatedFor: image.generatedFor ?? '',
        })),
        status:
          document.statuses.find((option) => option.id === item.statusId)
            ?.name ?? item.status,
        category:
          document.categories.find((option) => option.id === item.categoryId)
            ?.name ?? item.category,
      };
    }),
  };
}
