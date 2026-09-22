import { setWorkerUrl } from 'maplibre-gl'
import { MAPLIBRE_WORKER_DIR } from './maplibreWorkerPath'

/**
 * MapLibre resolves its worker against `import.meta.url` of its own bundle
 * chunk, which the bundler cannot rewrite, so the production build requests a
 * file that was never emitted. `vite.config.ts` publishes the worker under a
 * fixed path; point MapLibre at it before any map is constructed.
 */
setWorkerUrl(`${import.meta.env.BASE_URL}${MAPLIBRE_WORKER_DIR}/maplibre-gl-worker.mjs`)
