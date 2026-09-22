/** Output path that both the Vite plugin and `setWorkerUrl()` agree on. */
export const MAPLIBRE_WORKER_DIR = 'assets/maplibre'

/** The worker entry plus the shared chunk it imports relative to itself. */
export const MAPLIBRE_WORKER_FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'] as const
