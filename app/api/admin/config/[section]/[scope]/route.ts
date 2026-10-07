import { adminBody, adminRoute, adminSection } from '@/lib/admin-record-route';
import { getAdminConfig, saveAdminConfig } from '@/lib/admin-records';
import { seoEnvironment } from '@/lib/seo-environment.mjs';

type Params = { params: Promise<{ section: string; scope: string }> };
export async function GET(request: Request, { params }: Params) {
  return adminRoute(request, async () => {
    const { section, scope } = await params;
    const result = await getAdminConfig(adminSection(section), scope);
    return section === 'site' && scope === 'root' ? { ...result, seoEnvironment: seoEnvironment() } : result;
  });
}
export async function PUT(request: Request, { params }: Params) {
  return adminRoute(request, async () => {
    const { section, scope } = await params;
    const { value, revision } = await adminBody(request);
    return saveAdminConfig(adminSection(section), scope, value, revision);
  });
}
