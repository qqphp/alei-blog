import Link from 'next/link';

export function Breadcrumbs({ items }: { items: { name: string; path: string }[] }) {
  return <nav aria-label="面包屑" className="seo-breadcrumbs">
    {items.map((item, index) => <span key={item.path}>{index > 0 && ' / '}
      {index === items.length - 1 ? <span aria-current="page">{item.name}</span> : <Link href={item.path}>{item.name}</Link>}
    </span>)}
  </nav>;
}
