import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // MapLibre ships its own web worker; pre-bundling breaks the worker URL in dev.
  optimizeDeps: { exclude: ['maplibre-gl'] },
})
