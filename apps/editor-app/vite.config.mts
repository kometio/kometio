/// <reference types='vitest' />
import path from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';

const ENV_DIR = '../../';
// loadEnv() resolves its envDir against process.cwd(), unlike Vite's own
// `envDir` config option which resolves against the project root — so it
// needs an absolute path here, not the same relative string used below.
const ABSOLUTE_ENV_DIR = path.resolve(import.meta.dirname, ENV_DIR);

/**
 * The two addresses the editor talks to, written where the browser can
 * read them at START-UP rather than compiled into the bundle
 * (docs/adr/0076). In the container an entrypoint writes this same file
 * from the environment; here it is generated from the build-time
 * variables, so `nx build` output served from any static host still
 * works, and `nx serve` needs no extra step.
 */
function runtimeConfigJs(env: Record<string, string>): string {
  return `window.__KOMETIO_CONFIG__ = ${JSON.stringify(
    {
      apiUrl: env.VITE_API_URL ?? '',
      publicSiteUrl: env.VITE_PUBLIC_SITE_URL ?? '',
    },
    null,
    2,
  )};\n`;
}

function runtimeConfigPlugin(mode: string): Plugin {
  const env = loadEnv(mode, ABSOLUTE_ENV_DIR, '');
  return {
    name: 'kometio-runtime-config',
    configureServer(server) {
      // Generated per request in dev: editing .env then reloading is
      // enough, with no restart and no file written into the repo.
      server.middlewares.use('/config.js', (_request, response) => {
        response.setHeader('Content-Type', 'application/javascript');
        response.end(runtimeConfigJs(env));
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'config.js',
        source: runtimeConfigJs(env),
      });
    },
  };
}

/**
 * The editor's Content-Security-Policy, in development only.
 *
 * In production nginx sends it as a real header built from the same
 * environment the addresses come from (apps/editor-app/nginx.conf.template),
 * which a `<meta>` tag cannot be: it would have to be rewritten inside the
 * built HTML at every start, and `frame-ancestors` is ignored there anyway.
 * Keeping it here for `nx serve` means a policy violation still shows up
 * while developing, instead of only once deployed.
 */
function devCspPlugin(mode: string): Plugin {
  const env = loadEnv(mode, ABSOLUTE_ENV_DIR, '');
  return {
    name: 'kometio-dev-csp',
    apply: 'serve',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const apiOrigin = new URL(env.VITE_API_URL).origin;
        const site = env.VITE_PUBLIC_SITE_URL;
        const policy = [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
          "style-src 'self' 'unsafe-inline'",
          `img-src 'self' data: ${apiOrigin}`,
          "font-src 'self' data:",
          `connect-src 'self' ws: ${apiOrigin} ${site} https://challenges.cloudflare.com`,
          `frame-src ${site} https://challenges.cloudflare.com`,
          "object-src 'none'",
          "base-uri 'self'",
        ].join('; ');
        return html.replace(
          '</title>',
          `</title>\n    <meta http-equiv="Content-Security-Policy" content="${policy};" />`,
        );
      },
    },
  };
}

export default defineConfig(({ mode }) => ({
  root: import.meta.dirname,
  // VITE_-prefixed vars live in the repo-root .env, same as everywhere else.
  envDir: ENV_DIR,
  cacheDir: '../../node_modules/.vite/apps/editor-app',
  resolve: {
    alias: {
      '@': `${import.meta.dirname}/src`,
    },
  },
  server: {
    port: 4200,
    host: 'localhost',
  },
  preview: {
    port: 4200,
    host: 'localhost',
  },
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    runtimeConfigPlugin(mode),
    devCspPlugin(mode),
  ],
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [],
  // },
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  test: {
    name: '@kometio/editor-app',
    watch: false,
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.spec.{ts,tsx}',
        // Helpers for specs, not code under test (docs/adr/0009).
        'src/**/*.test-fixture.ts',
        'src/main.tsx',
        'src/test-setup.ts',
        'src/routeTree.gen.ts',
      ],
      thresholds: {
        statements: 60,
        branches: 60,
        functions: 60,
        lines: 60,
      },
    },
  },
}));
