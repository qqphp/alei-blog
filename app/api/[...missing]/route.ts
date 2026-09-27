import { json, readLimitedBody } from '@/lib/admin-auth';

async function missingApi(request: Request) {
  try {
    // Finish incoming bodies so the preview can serve the next request.
    await readLimitedBody(request, 2_000_000);
    return json({ error: '接口不存在' }, 404);
  } catch (error) {
    return json({ error: error instanceof RangeError ? '请求内容过大' : '请求内容无效' },
      error instanceof RangeError ? 413 : 400);
  }
}

export { missingApi as GET, missingApi as POST, missingApi as PUT,
  missingApi as PATCH, missingApi as DELETE, missingApi as HEAD, missingApi as OPTIONS };
