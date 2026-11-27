import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';

const ROOT_DIR = import.meta.dirname;

function normalizeBasePath(rawBase?: string): string {
  const trimmed = (rawBase ?? '').trim();
  if (!trimmed || trimmed === '/' || trimmed === './' || trimmed === '.') {
    return '/';
  }
  const collapsed = trimmed.replace(/\/+/g, '/').replace(/^\.\//, '');
  const withLeading = collapsed.startsWith('/') ? collapsed : `/${collapsed}`;
  const withTrailing = withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
  return withTrailing === '//' ? '/' : withTrailing;
}

function collectDistFiles(dir: string, rootDir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectDistFiles(fullPath, rootDir));
    } else if (entry.isFile()) {
      const rel = path.relative(rootDir, fullPath).split(path.sep).join('/');
      if (rel !== 'sw.js' && !rel.endsWith('.map')) {
        results.push(rel);
      }
    }
  }
  return results.sort();
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, ROOT_DIR, '');
  const rawBase =
    command === 'serve' && !process.env.VITE_BASE_PATH
      ? '/'
      : (process.env.VITE_BASE_PATH ?? env.VITE_BASE_PATH ?? '/');
  const base = normalizeBasePath(rawBase);

  return {
    base,
    define: {
      __S404_BUILD_SW__: JSON.stringify(command === 'build'),
    },
    plugins: [
      react(),
      tailwindcss(),
      // Copies src/assets into dist/ and finalizes base-aware manifest & SW precache list.
      {
        name: 'configure-gh-pages-pwa',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(ROOT_DIR, 'dist');
          const srcAssets = path.resolve(ROOT_DIR, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, { recursive: true, force: true });
          }

          const manifestPath = path.resolve(distDir, 'manifest.webmanifest');
          if (fs.existsSync(manifestPath)) {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
              id?: string;
              start_url?: string;
              scope?: string;
              icons?: Array<{ src: string }>;
            };
            manifest.id = base;
            manifest.start_url = base;
            manifest.scope = base;
            if (Array.isArray(manifest.icons)) {
              manifest.icons = manifest.icons.map((icon) => ({
                ...icon,
                src: `${base}${icon.src.replace(/^\.\//, '').replace(/^\/+/, '')}`,
              }));
            }
            fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
          }

          const swPath = path.resolve(distDir, 'sw.js');
          if (fs.existsSync(swPath)) {
            const distFiles = collectDistFiles(distDir, distDir);
            const buildHash = crypto
              .createHash('sha256')
              .update(`${base}:${distFiles.join('|')}`)
              .digest('hex')
              .slice(0, 10);

            const swSource = fs
              .readFileSync(swPath, 'utf8')
              .replace(
                /\/\* @S404_CACHE_VERSION \*\/ '[^']*'/,
                `/* @S404_CACHE_VERSION */ 'v2-${buildHash}'`
              )
              .replace(
                /\/\* @S404_PRECACHE_ASSETS \*\/ \[[^\]]*\]/,
                `/* @S404_PRECACHE_ASSETS */ ${JSON.stringify(distFiles)}`
              );
            fs.writeFileSync(swPath, swSource, 'utf8');
          }
        },
      },
    ],
    build: {
      sourcemap: false,
      rolldownOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
              return 'vendor-react';
            }
            if (id.includes('node_modules/motion') || id.includes('node_modules/lucide-react')) {
              return 'vendor-ui';
            }
            if (id.includes('/src/data/')) {
              return 'question-bank';
            }
            return undefined;
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': ROOT_DIR,
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
