import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig, loadEnv } from 'vite';
import { ensureManagedPostgres } from './scripts/managed-postgres.mjs';

export default defineConfig(async ({ command, mode }) => {
  const localEnvironment = loadEnv(mode, process.cwd(), '');
  for (const [key, value] of Object.entries(localEnvironment))
    process.env[key] ??= value;
  if (command === 'serve') await ensureManagedPostgres();
  return {
    css: { postcss: { plugins: [tailwindcss()] } },
    ssr: { external: ['pg', 'sharp', 'undici'] },
    server: {
      host: process.env.HOST || '127.0.0.1',
      port: 3000,
      ...(process.env.CODEX_SANDBOX === 'seatbelt'
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [vinext(), sites()],
  };
});
