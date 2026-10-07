import { categoryBranch, type CategoryNode } from '@/lib/article-categories';
import Link from 'next/link';

export function WritingCategoryTree({
  categories,
  articles,
  counts,
  selected,
  onSelect,
  categoryHref,
}: {
  categories: CategoryNode[];
  articles?: { categoryId: string }[];
  counts?: Record<string, number>;
  selected: string;
  onSelect: (id: string) => void;
  categoryHref?: (id: string) => string;
}) {
  function branch(parentId: string) {
    return (
      <ul className="writing-category-tree">
        {categories
          .filter((category) => category.parentId === parentId)
          .map((category) => {
            const ids = categoryBranch(categories, category.id);
            const count = counts
              ? [...ids].reduce((sum, id) => sum + (counts[id] ?? 0), 0)
              : (articles ?? []).filter((article) => ids.has(article.categoryId)).length;
            return (
              <li key={category.id}>
                {categoryHref ? <Link href={categoryHref(category.id)}
                  className={selected === category.id ? 'active' : ''}
                  aria-current={selected === category.id ? 'true' : undefined}>
                  <span>{category.name}</span><b>{count}</b>
                </Link> : <button
                  type="button"
                  className={selected === category.id ? 'active' : ''}
                  aria-current={selected === category.id ? 'true' : undefined}
                  onClick={() => onSelect(category.id)}
                >
                  <span>{category.name}</span>
                  <b>{count}</b>
                </button>}
                {categories.some((item) => item.parentId === category.id) &&
                  branch(category.id)}
              </li>
            );
          })}
      </ul>
    );
  }
  return branch('');
}
