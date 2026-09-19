/**
 * Locally simulated heat-exposure zones for the Abu Dhabi demo area.
 *
 * Nothing here comes from a sensor network or an external API: the grid is
 * generated deterministically from a fixed seed so the demo looks identical
 * on every run. Each zone's Heat Exposure Score is calculated once here (via
 * the engine in `src/lib/heatExposure.ts`) and reused everywhere it's
 * needed — the map, the legend, and the zone inspector — so there is a
 * single source of truth and no duplicated scoring logic.
 */

import type { FeatureCollection, Polygon } from 'geojson'
import { calculateHeatExposure, type HeatExposureBreakdown } from '../lib/heatExposure'

export type HeatZoneFactors = {
  temperatureC: number
  humidityPct: number
  solarExposurePct: number
  shadePct: number
  vegetationPct: number
  pedestrianDensityPct: number
}

export type HeatZone = {
  id: string
  name: string
  district: string
  center: { lat: number; lng: number }
  /** Closed ring in [lng, lat] order, ready for GeoJSON. */
  polygon: [number, number][]
  factors: HeatZoneFactors
  /** Heat Exposure Score (0–100) and category, computed once at build time. */
  heatExposure: HeatExposureBreakdown
}

export const DEMO_AREA = {
  city: 'Abu Dhabi',
  country: 'United Arab Emirates',
  center: { lat: 24.4539, lng: 54.3773 },
  zoom: 11.2,
} as const

/**
 * Five-stop color gradient used purely for the map fill and legend. This is
 * a visual smoothing layer only — the actual exposure categories shown in
 * the zone inspector come from `EXPOSURE_CATEGORIES` in `lib/heatExposure`.
 * The stops (0–1) are fed by each zone's Heat Exposure Score / 100.
 */
export const HEAT_BANDS = [
  { id: 'low', label: 'Low', color: '#2dd4bf', min: 0 },
  { id: 'moderate', label: 'Moderate', color: '#a3e635', min: 0.35 },
  { id: 'elevated', label: 'Elevated', color: '#fbbf24', min: 0.55 },
  { id: 'high', label: 'High', color: '#fb7185', min: 0.72 },
  { id: 'extreme', label: 'Extreme', color: '#e11d48', min: 0.86 },
] as const

const DISTRICTS = [
  'Al Markaziyah',
  'Al Zahiyah',
  'Corniche',
  'Al Khalidiyah',
  'Al Mushrif',
  'Al Bateen',
  'Madinat Zayed',
  'Al Reem',
  'Khalifa City',
  'Yas Marina',
  'Saadiyat',
  'Mussafah',
]

/** Deterministic PRNG so the simulated city never shifts between reloads. */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const round = (value: number, decimals = 0) => {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

const GRID_COLUMNS = 11
const GRID_ROWS = 8
/** Hexagon radius in degrees of latitude. */
const HEX_RADIUS = 0.0125

function hexagon(center: { lat: number; lng: number }): [number, number][] {
  const lngScale = 1 / Math.cos((center.lat * Math.PI) / 180)
  const ring: [number, number][] = []
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 180) * (60 * i - 30)
    ring.push([
      round(center.lng + HEX_RADIUS * lngScale * Math.cos(angle), 6),
      round(center.lat + HEX_RADIUS * Math.sin(angle), 6),
    ])
  }
  ring.push(ring[0])
  return ring
}

/**
 * Rough stand-in for "how built-up is this part of town": the island core is
 * dense asphalt, the outskirts are sparser, and the coast gets a sea breeze.
 */
function urbanPressure(lat: number, lng: number) {
  const dLat = (lat - DEMO_AREA.center.lat) / 0.09
  const dLng = (lng - DEMO_AREA.center.lng) / 0.13
  const distance = Math.sqrt(dLat * dLat + dLng * dLng)
  return clamp(1 - distance * 0.62, 0, 1)
}

function buildZone(index: number, center: { lat: number; lng: number }, random: () => number) {
  const pressure = urbanPressure(center.lat, center.lng)
  const noise = random()
  const greenPocket = random() < 0.18

  const vegetation = clamp(
    (greenPocket ? 45 : 8) + (1 - pressure) * 22 + noise * 18 - pressure * 6,
    2,
    78,
  )
  const shade = clamp(6 + pressure * 26 + vegetation * 0.35 + random() * 12, 3, 72)
  const solar = clamp(96 - shade * 0.85 - vegetation * 0.2 + random() * 8, 25, 99)
  const coastal = clamp(1 - Math.abs(center.lat - 24.49) / 0.12, 0, 1)
  const humidity = clamp(38 + coastal * 26 + random() * 12 - pressure * 6, 28, 88)
  const temperature = clamp(
    37.5 + pressure * 6.2 - vegetation * 0.05 - shade * 0.035 + solar * 0.02 + noise * 1.6,
    33,
    49,
  )
  const pedestrian = clamp(pressure * 78 + random() * 26 - (greenPocket ? 10 : 0), 4, 97)

  const factors: HeatZoneFactors = {
    temperatureC: round(temperature, 1),
    humidityPct: round(humidity),
    solarExposurePct: round(solar),
    shadePct: round(shade),
    vegetationPct: round(vegetation),
    pedestrianDensityPct: round(pedestrian),
  }

  return {
    id: `zone-${String(index + 1).padStart(2, '0')}`,
    name: `Zone ${String(index + 1).padStart(2, '0')}`,
    district: DISTRICTS[index % DISTRICTS.length],
    center: { lat: round(center.lat, 5), lng: round(center.lng, 5) },
    polygon: hexagon(center),
    factors,
    heatExposure: calculateHeatExposure(factors),
  } satisfies HeatZone
}

function generateZones(): HeatZone[] {
  const random = mulberry32(20_260_919)
  const zones: HeatZone[] = []
  const latStep = HEX_RADIUS * 1.5
  const lngStep = HEX_RADIUS * Math.sqrt(3)

  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let column = 0; column < GRID_COLUMNS; column += 1) {
      const lat = DEMO_AREA.center.lat + (row - (GRID_ROWS - 1) / 2) * latStep
      const lngScale = 1 / Math.cos((lat * Math.PI) / 180)
      const offset = row % 2 === 0 ? 0 : lngStep / 2
      const lng =
        DEMO_AREA.center.lng + ((column - (GRID_COLUMNS - 1) / 2) * lngStep + offset) * lngScale
      zones.push(buildZone(zones.length, { lat, lng }, random))
    }
  }

  return zones
}

export const HEAT_ZONES: HeatZone[] = generateZones()

export const HEAT_ZONE_COLLECTION: FeatureCollection<Polygon> = {
  type: 'FeatureCollection',
  features: HEAT_ZONES.map((zone) => ({
    type: 'Feature',
    id: Number(zone.id.replace('zone-', '')),
    geometry: { type: 'Polygon', coordinates: [zone.polygon] },
    properties: {
      id: zone.id,
      name: zone.name,
      // Drives the map's fill color — the real Heat Exposure Score,
      // normalized to 0–1 for the gradient stops in HEAT_BANDS.
      intensity: zone.heatExposure.score / 100,
    },
  })),
}

export function summarizeZones(zones: HeatZone[]) {
  const count = zones.length || 1
  const avgTemperature = zones.reduce((total, zone) => total + zone.factors.temperatureC, 0) / count
  const avgHumidity = zones.reduce((total, zone) => total + zone.factors.humidityPct, 0) / count
  const highExposure = zones.filter((zone) => zone.heatExposure.category.id === 'very-high').length

  return {
    zoneCount: zones.length,
    avgTemperature: round(avgTemperature, 1),
    avgHumidity: round(avgHumidity),
    highExposure,
  }
}
