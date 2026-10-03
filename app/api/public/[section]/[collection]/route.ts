import { getPublicPage } from '@/lib/public-records';
import {
  publicCollectionSizes,
  type PublicCollectionKey,
} from '@/lib/public-collections';
import { json } from '@/lib/admin-auth';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ section: string; collection: string }> },
) {
  const { section, collection } = await params;
  const key = `${section}.${collection}`;
  if (!Object.hasOwn(publicCollectionSizes, key))
    return json({ error: '列表不存在' }, 404);
  const query = new URL(request.url).searchParams;
  const page = Number(query.get('page') ?? 1);
  const q = query.get('q') ?? '';
  const category = query.get('category') ?? '';
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 10000 ||
    q.length > 100 ||
    category.length > 200
  )
    return json({ error: '查询条件无效' }, 400);
  return json(
    await getPublicPage(key as PublicCollectionKey, { page, q, category }),
  );
}
