'use client';
import { type Project, type ProjectImage } from '@/lib/project-content';
import { api } from './admin-fields';

export async function createProjectImage(
  project: Project,
  image: ProjectImage,
): Promise<ProjectImage> {
  const result = await api<{ url: string; generatedFor: string }>(
    '/api/admin/ai',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'project-cover',
        title: project.title,
        subtitle: project.subtitle,
        excerpt: project.description,
      }),
    },
  );
  return {
    ...image,
    src: result.url,
    generatedFor: result.generatedFor,
    alt: image.alt || project.title,
    label: image.label || '项目封面',
  };
}
