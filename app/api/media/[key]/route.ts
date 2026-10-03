import { readLocalMedia } from '@/lib/local-media';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!/^[a-f0-9-]+\.(png|jpg|gif|webp|mp3|wav|file)$/.test(key))
    return new Response('Not found', { status: 404 });
  try {
    const file = await readLocalMedia(key, request.headers);
    if (file.status === 404) return new Response('Not found', { status: 404 });
    const headers = new Headers(file.headers);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(file.body, { status: file.status, headers });
  } catch {
    return new Response('Local media storage unavailable', { status: 503 });
  }
}
