import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { toString } from 'mdast-util-to-string';

export function automaticDescription(text: string) {
  return Array.from(text.replace(/\s+/gu, ' ').trim()).slice(0, 160).join('');
}

export function articleDescription(article: { seoDescription?: string; excerpt: string; body: string }) {
  if (article.seoDescription?.trim()) return article.seoDescription;
  if (article.excerpt.trim()) return automaticDescription(article.excerpt);
  const tree = unified().use(remarkParse).use(remarkGfm).parse(article.body);
  // Separate block nodes so adjacent paragraphs do not run together.
  return automaticDescription(tree.children.map((node) => toString(node, { includeHtml: false })).join(' '));
}

export function brandedTitle(title: string, name: string) {
  return `${title} · ${name}`;
}

export function listUrl(path: string, input: { page?: number; group?: string; q?: string; category?: string; project?: string } = {}) {
  const params = new URLSearchParams();
  for (const key of ['project', 'group', 'q', 'category'] as const)
    if (input[key]) params.set(key, input[key]);
  if (input.page && input.page > 1) params.set('page', String(input.page));
  return path + (params.size ? `?${params}` : '');
}

export function requestedPage(value: string | undefined) {
  return value && /^\d+$/.test(value) ? Math.max(1, Math.min(Number(value), Number.MAX_SAFE_INTEGER)) : 1;
}

export function pageNeedsRedirect(value: string | undefined, actual: number) {
  return value !== undefined && (!/^[1-9]\d*$/.test(value) || Number(value) !== actual);
}
