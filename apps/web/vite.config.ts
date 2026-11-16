import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/** Every file under `dir`, as site paths (`/assets/x.js`). */
function sitePaths(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => '/' + relative(dir, join(e.parentPath, e.name)).split(sep).join('/'));
}

/**
 * The app kept on the device (D55): after a build, the list of its files (and a version made from
 * them) goes into `sw.js`, which saves them on install. A new build changes the worker, so phones
 * pick up the new app; the dev server leaves the worker without a list (it caches nothing).
 */
function precache(): Plugin {
  let outDir = '';
  return {
    name: 'strekatron-precache',
    apply: 'build',
    configResolved(config) {
      outDir = join(config.root, config.build.outDir);
    },
    closeBundle() {
      const sw = join(outDir, 'sw.js');
      const files = [
        '/',
        ...sitePaths(outDir).filter(
          (f) => f !== '/sw.js' && f !== '/index.html' && !f.endsWith('.map'),
        ),
      ].sort();
      const hash = createHash('sha256');
      for (const f of files) {
        hash.update(f);
        if (f !== '/') hash.update(readFileSync(join(outDir, f)));
        else hash.update(readFileSync(join(outDir, 'index.html')));
      }
      const list = { version: hash.digest('hex').slice(0, 12), files };
      const marker = '/*__PRECACHE__*/ null';
      const code = readFileSync(sw, 'utf8');
      if (!code.includes(marker)) throw new Error('sw.js has no precache marker');
      writeFileSync(sw, code.replace(marker, JSON.stringify(list)));
    },
  };
}

export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    precache(),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // Same origin for the browser: cookies and auth work as in production.
      '/api': { target: 'http://127.0.0.1:3001', xfwd: true },
    },
  },
});
