# HeatWise

Urban heat intelligence prototype for extreme-heat cities. Hackathon build — **all data is simulated locally**; no municipal sensors and no paid APIs.

## Experiences

- **City Intelligence** — interactive map of simulated heat-exposure zones, per-zone scores and factors, and a "What If?" intervention simulator.
- **HeatWise Routes** — compare the fastest route against a lower-heat-exposure route.

Today the shell plus the City Intelligence map exist. The Heat Exposure Score model, AI explanations, the "What If?" simulator and routing arrive in later tasks — the map currently shades zones with a temporary preview intensity.

## Stack

React 19 · TypeScript · Vite · Tailwind CSS v4 · React Router · MapLibre GL · lucide-react

The basemap is OpenFreeMap's key-free Positron style (OpenStreetMap data).

## Getting started

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # type-check + production build
npm run lint
```

## Conventions

- No API keys in the repo. Anything configurable goes through `.env` files (git-ignored) and `import.meta.env`.
- Simulated data lives under `src/data/`.
