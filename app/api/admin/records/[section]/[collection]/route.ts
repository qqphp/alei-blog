import { adminBody, adminRoute, adminSection } from '@/lib/admin-record-route';
import { createAdminRecord, listAdminRecords } from '@/lib/admin-records';

type Params = { params: Promise<{ section: string; collection: string }> };
export async function GET(request: Request, { params }: Params) {
  return adminRoute(request, async () => {
    const { section, collection } = await params;
    const search = new URL(request.url).searchParams;
    return listAdminRecords(adminSection(section), collection, {
      page: Number(search.get('page') ?? 1), size: Number(search.get('size') ?? 20),
      q: search.get('q') ?? '', status: search.get('status') ?? 'all',
      categoryId: search.get('categoryId') ?? '', statusId: search.get('statusId') ?? '',
    });
  });
}
export async function POST(request: Request, { params }: Params) {
  return adminRoute(request, async () => {
    const { section, collection } = await params;
    const { value } = await adminBody(request);
    return createAdminRecord(adminSection(section), collection, value);
  });
}
