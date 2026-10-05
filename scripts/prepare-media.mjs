import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

await mkdir(resolve(process.env.CMS_MEDIA_DIRECTORY || '.local/media'), {
  recursive: true,
});
