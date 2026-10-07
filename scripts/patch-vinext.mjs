import { access, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Vinext 1.0.1 bundles the vulnerable parser; npm overrides cannot replace it.
// Keep its exports while using the patched, pinned dependency after every npm ci.
const parser = resolve(
  'node_modules/vinext/dist/deps/.pnpm/image-size@2.0.2/deps/image-size/dist/index.js',
);
await access(parser);
await writeFile(parser, 'export { default, imageSize, types } from "image-size";\n');

// This optional dependency stub shadows Sharp's installed, authoritative types.
const stubPath = resolve('node_modules/@vinext/types/next/next-external-stubs.d.ts');
const stubs = await readFile(stubPath, 'utf8');
await writeFile(stubPath, stubs.replace(/declare module "sharp" \{\r?\n  const sharp: unknown;\r?\n  export default sharp;\r?\n\}\r?\n/, ''));
console.log('Vinext uses the patched image parser and installed Sharp types');

// Vinext 1.0.1's Node image endpoint only reads static files. CMS uploads are
// served by an App Router endpoint, so its generated /_next/image URLs return 404.
// Keep Next/Image's responsive srcsets; resolve only our fixed media route,
// with no external fetches, then resize via the existing Sharp dependency.
const prodServerPath = resolve('node_modules/vinext/dist/server/prod-server.js');
let prodServer = await readFile(prodServerPath, 'utf8');
const imageMarker = '// CMS_LOCAL_MEDIA_IMAGE_OPTIMIZATION';
if (!prodServer.includes(imageMarker)) {
  const anchor = '\t\t\tconst ct = contentTypeForPath(params.imageUrl);';
  if (!prodServer.includes(anchor)) throw new Error('Vinext Node image endpoint changed; review the CMS media compatibility patch');
  const replacement = `
            ${imageMarker}
            if (/^\\/api\\/media\\/[a-f0-9-]+\\.(png|jpg|gif|webp)$/.test(params.imageUrl)) {
                try {
                    const request = nodeToWebRequest(req, rawUrl, prerenderSecret, appRouterI18nConfig, appRouterAuthorizeOnDemandRevalidate);
                    const source = await rscHandler(new Request(new URL(params.imageUrl, request.url)), createNodeExecutionContext());
                    if (!source.ok) {
                        await source.body?.cancel();
                        res.writeHead(source.status); res.end('Image unavailable'); return;
                    }
                    const input = Buffer.from(await source.arrayBuffer());
                    const { default: sharp } = await import('sharp');
                    const output = await sharp(input, { animated: true }).resize({ width: params.width, withoutEnlargement: true }).webp({ quality: params.quality }).toBuffer();
                    sendCompressed(req, res, output, 'image/webp', 200, {
                        'Cache-Control': 'public, max-age=31536000, immutable',
                        'X-Content-Type-Options': 'nosniff',
                        'Content-Security-Policy': "script-src 'none'; frame-src 'none'; sandbox;",
                    }, false);
                } catch (error) {
                    console.error('[vinext] CMS image optimization failed:', error);
                    res.writeHead(503); res.end('Image optimization unavailable');
                }
                return;
            }
${anchor}`;
  // Only the first occurrence belongs to this project's App Router runtime.
  prodServer = prodServer.replace(anchor, replacement);
}
// Load Sharp before accepting traffic so the first visible image doesn't pay
// its native-module startup cost during LCP. This also updates an older patch.
if (!prodServer.includes('import sharp from "sharp";')) {
  prodServer = 'import sharp from "sharp";\n' + prodServer.replace("                    const { default: sharp } = await import('sharp');\n", '');
}
await writeFile(prodServerPath, prodServer);
console.log('Vinext Node image endpoint supports CMS media resizing');

// Honor the configured blocking metadata rule even when User-Agent is absent.
// Vinext 1.0.1 otherwise streams metadata into the body for these requests.
const metadataPath = resolve('node_modules/vinext/dist/server/streaming-metadata.js');
const metadata = await readFile(metadataPath, 'utf8');
const metadataAnchor = '\tif (!userAgent) return true;';
const metadataMarker = '// SEO_BLOCKING_METADATA_WITHOUT_USER_AGENT';
if (!metadata.includes(metadataMarker)) {
  if (!metadata.includes(metadataAnchor)) throw new Error('Vinext metadata handling changed; review the SEO compatibility patch');
  await writeFile(metadataPath, metadata.replace(metadataAnchor, '\t' + metadataMarker));
}
console.log('Vinext honors blocking metadata for requests without User-Agent');
