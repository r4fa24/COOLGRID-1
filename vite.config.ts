import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { MAPLIBRE_WORKER_DIR, MAPLIBRE_WORKER_FILES } from './src/components/map/maplibreWorkerPath.ts'

/**
 * MapLibre loads its tile-parsing worker from a sibling file resolved at runtime
 * against `import.meta.url`, so the bundler never sees the dependency and the
 * files are missing from the production output. Serve them from one stable path
 * in both dev and build so `setWorkerUrl()` resolves identically everywhere.
 */
function maplibreWorkerAssets(): Plugin {
  const require = createRequire(import.meta.url)
  const distDir = path.dirname(require.resolve('maplibre-gl/dist/maplibre-gl-worker.mjs'))
  const sourceFor = (fileName: string) => readFile(path.join(distDir, fileName))

  return {
    name: 'maplibre-worker-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const fileName = MAPLIBRE_WORKER_FILES.find((name) =>
          req.url?.split('?')[0]?.endsWith(`${MAPLIBRE_WORKER_DIR}/${name}`),
        )
        if (!fileName) return next()
        sourceFor(fileName).then(
          (source) => {
            res.setHeader('Content-Type', 'text/javascript')
            res.end(source)
          },
          (error) => next(error),
        )
      })
    },
    async generateBundle() {
      for (const fileName of MAPLIBRE_WORKER_FILES) {
        this.emitFile({
          type: 'asset',
          fileName: `${MAPLIBRE_WORKER_DIR}/${fileName}`.replace(/^\//, ''),
          source: await sourceFor(fileName),
        })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), maplibreWorkerAssets()],
  // MapLibre ships its own web worker; pre-bundling breaks the worker URL in dev.
  optimizeDeps: { exclude: ['maplibre-gl'] },
})
