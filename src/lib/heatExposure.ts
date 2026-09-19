/**
 * Heat Exposure Score engine.
 *
 * Turns a zone's simulated environmental factors into a single, explainable
 * 0–100 score. The model is intentionally simple and fully deterministic —
 * no AI, no randomness, no external calls. Every weight and threshold below
 * is named and lives in this one file so the model can be tuned without
 * touching any UI code.
 *
 * HOW THE SCORE IS BUILT
 * 1. Each raw factor (temperature, solar exposure, ...) is normalized to a
 *    0–1 range using fixed, documented reference bounds.
 * 2. Factors that raise heat exposure (temperature, solar exposure,
 *    pedestrian density, humidity, and building density when available) are
 *    combined into a weighted "heat load", where the weights sum to 1.
 * 3. Factors that lower it (shade, vegetation) subtract up to a capped
 *    number of points from that load.
 * 4. The result is scaled to 0–100 and clamped.
 */

import type { HeatZoneFactors } from '../data/heatZones'

/**
 * Building density isn't part of the current simulated dataset, but the
 * engine accepts it as an optional field so a future `buildingDensityPct`
 * on zone data starts contributing to the score with no logic changes.
 */
export type HeatExposureInput = HeatZoneFactors & {
  buildingDensityPct?: number
}

// ---------------------------------------------------------------------------
// 1. Normalization bounds. "Comfortable" to "extreme" reference range for
//    ambient temperature. Change this to recalibrate the whole model.
// ---------------------------------------------------------------------------
const TEMPERATURE_RANGE_C = { min: 20, max: 50 } as const

// ---------------------------------------------------------------------------
// 2. Weights for factors that INCREASE exposure. Sum to 1 when building
//    density is available. When it isn't, its weight is redistributed
//    proportionally across the remaining factors (see `activeWeightsFor`)
//    so the score always sits on the same 0–100 scale.
// ---------------------------------------------------------------------------
const HEAT_INCREASING_WEIGHTS = {
  temperature: 0.36,
  solarExposure: 0.22,
  pedestrianDensity: 0.14,
  humidity: 0.1,
  buildingDensity: 0.18,
} as const

type HeatIncreasingFactor = keyof typeof HEAT_INCREASING_WEIGHTS

// Factors that DECREASE exposure. Each subtracts up to this many points
// (out of 100) when it sits at 100%.
const HEAT_REDUCING_MAX_POINTS = {
  shade: 14,
  vegetation: 12,
} as const

type HeatReducingFactor = keyof typeof HEAT_REDUCING_MAX_POINTS

// ---------------------------------------------------------------------------
// 3. Exposure categories. Edit thresholds/colors here only — every part of
//    the UI reads from this single source of truth.
// ---------------------------------------------------------------------------
export const EXPOSURE_CATEGORIES = [
  { id: 'low', label: 'Low Exposure', min: 0, color: '#2dd4bf' },
  { id: 'moderate', label: 'Moderate Exposure', min: 25, color: '#a3e635' },
  { id: 'high', label: 'High Exposure', min: 50, color: '#fb7185' },
  { id: 'very-high', label: 'Very High Exposure', min: 75, color: '#e11d48' },
] as const

export type ExposureCategory = (typeof EXPOSURE_CATEGORIES)[number]
export type ExposureCategoryId = ExposureCategory['id']

export function exposureCategoryFor(score: number): ExposureCategory {
  let category: ExposureCategory = EXPOSURE_CATEGORIES[0]
  for (const candidate of EXPOSURE_CATEGORIES) {
    if (score >= candidate.min) category = candidate
  }
  return category
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const clamp01 = (value: number) => clamp(value, 0, 1)
const normalizePercent = (pct: number) => clamp01(pct / 100)

export type PercentageFactorLevel = 'low' | 'moderate' | 'high'

/** Shared labels for all percentage-based environmental factors. */
export function percentageFactorLevel(value: number): PercentageFactorLevel {
  return value < 25 ? 'low' : value < 50 ? 'moderate' : 'high'
}

export function percentageFactorLabel(value: number) {
  const level = percentageFactorLevel(value)
  return level === 'low' ? 'Low' : level === 'moderate' ? 'Moderate' : 'High'
}

function normalizeTemperature(temperatureC: number) {
  const { min, max } = TEMPERATURE_RANGE_C
  return clamp01((temperatureC - min) / (max - min))
}

export type HeatExposureBreakdown = {
  /** Final 0–100 Heat Exposure Score. */
  score: number
  category: ExposureCategory
  /** Each raw factor normalized to 0–1, for display or further logic.
   *  `buildingDensity` is `null` when that optional field wasn't provided. */
  normalized: {
    temperature: number
    solarExposure: number
    pedestrianDensity: number
    humidity: number
    buildingDensity: number | null
    shade: number
    vegetation: number
  }
  /** Points (0–100 scale) each factor actually contributed to the score. */
  contributions: {
    heatIncreasing: Record<HeatIncreasingFactor, number>
    heatReducing: Record<HeatReducingFactor, number>
  }
}

/**
 * Calculates the 0–100 Heat Exposure Score for a zone from its simulated
 * environmental factors. Deterministic and explainable: the same input
 * always produces the same output, and every point in the score can be
 * traced back to a named, weighted factor via `contributions`.
 */
export function calculateHeatExposure(factors: HeatExposureInput): HeatExposureBreakdown {
  const hasBuildingDensity = factors.buildingDensityPct !== undefined

  const normalized = {
    temperature: normalizeTemperature(factors.temperatureC),
    solarExposure: normalizePercent(factors.solarExposurePct),
    pedestrianDensity: normalizePercent(factors.pedestrianDensityPct),
    humidity: normalizePercent(factors.humidityPct),
    buildingDensity: hasBuildingDensity ? normalizePercent(factors.buildingDensityPct as number) : null,
    shade: normalizePercent(factors.shadePct),
    vegetation: normalizePercent(factors.vegetationPct),
  }

  const weights = activeWeightsFor(hasBuildingDensity)

  const heatIncreasing: Record<HeatIncreasingFactor, number> = {
    temperature: weights.temperature * normalized.temperature * 100,
    solarExposure: weights.solarExposure * normalized.solarExposure * 100,
    pedestrianDensity: weights.pedestrianDensity * normalized.pedestrianDensity * 100,
    humidity: weights.humidity * normalized.humidity * 100,
    buildingDensity: hasBuildingDensity
      ? weights.buildingDensity * (normalized.buildingDensity as number) * 100
      : 0,
  }

  const heatReducing: Record<HeatReducingFactor, number> = {
    shade: HEAT_REDUCING_MAX_POINTS.shade * normalized.shade,
    vegetation: HEAT_REDUCING_MAX_POINTS.vegetation * normalized.vegetation,
  }

  const rawScore = sumValues(heatIncreasing) - sumValues(heatReducing)
  const score = Math.round(clamp(rawScore, 0, 100))

  return {
    score,
    category: exposureCategoryFor(score),
    normalized,
    contributions: { heatIncreasing, heatReducing },
  }
}

/** Redistributes the buildingDensity weight across the other heat-increasing
 *  factors when that field isn't present, keeping weights summing to 1. */
function activeWeightsFor(hasBuildingDensity: boolean) {
  if (hasBuildingDensity) return HEAT_INCREASING_WEIGHTS

  const { temperature, solarExposure, pedestrianDensity, humidity } = HEAT_INCREASING_WEIGHTS
  const baseSum = temperature + solarExposure + pedestrianDensity + humidity
  const scale = 1 / baseSum

  return {
    temperature: temperature * scale,
    solarExposure: solarExposure * scale,
    pedestrianDensity: pedestrianDensity * scale,
    humidity: humidity * scale,
    buildingDensity: 0,
  }
}

function sumValues(record: Record<string, number>) {
  return Object.values(record).reduce((total, value) => total + value, 0)
}

// ---------------------------------------------------------------------------
// Deterministic, plain-language explanation of a score. No AI — built purely
// from which normalized factors are actually elevated for this zone.
// ---------------------------------------------------------------------------

const EXPLANATION_FACTOR_THRESHOLD = 0.35

export function explainHeatExposure(breakdown: HeatExposureBreakdown): string {
  const { normalized } = breakdown

  const candidates: { key: HeatIncreasingFactor; value: number }[] = (
    Object.keys(HEAT_INCREASING_WEIGHTS) as HeatIncreasingFactor[]
  )
    .map((key) => ({ key, value: normalized[key] }))
    .filter((entry): entry is { key: HeatIncreasingFactor; value: number } => entry.value !== null)

  const heatFactors = candidates
    .filter((entry) => entry.value >= EXPLANATION_FACTOR_THRESHOLD)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map(({ key, value }) => describeHeatFactor(key, value))

  const heatPhrase =
    heatFactors.length > 0
      ? joinWithAnd(heatFactors)
      : 'moderate heat conditions'

  return `This zone has ${heatPhrase}, ${describeCooling(normalized.shade, normalized.vegetation)}.`
}

function describeHeatFactor(key: HeatIncreasingFactor, value: number) {
  const intensity =
    key === 'temperature'
      ? value >= 0.75
        ? 'high'
        : value >= 0.55
          ? 'elevated'
          : value >= 0.35
            ? 'moderate'
            : 'low'
      : percentageFactorLevel(value * 100)
  const labels: Record<HeatIncreasingFactor, string> = {
    temperature: `${intensity} temperature`,
    solarExposure: `${intensity} solar exposure`,
    pedestrianDensity: `${intensity} pedestrian density`,
    humidity: `${intensity} humidity`,
    buildingDensity: `${intensity} building density`,
  }
  return labels[key]
}

function describeCooling(shade: number, vegetation: number) {
  const shadeLevel = percentageFactorLevel(shade * 100)
  const vegetationLevel = percentageFactorLevel(vegetation * 100)
  const shadeDescription = describeShade(shadeLevel)
  const vegetationDescription = describeVegetation(vegetationLevel)

  if (shadeLevel === 'high' && vegetationLevel === 'high') {
    return `while ${shadeDescription} and ${vegetationDescription} provide stronger cooling`
  }
  if (shadeLevel === 'high' && vegetationLevel === 'low') {
    return `but ${shadeDescription} provides some cooling despite ${vegetationDescription}`
  }
  if (shadeLevel === 'low' && vegetationLevel === 'high') {
    return `but ${vegetationDescription} provides some cooling despite ${shadeDescription}`
  }
  if (shadeLevel === 'low' && vegetationLevel === 'low') {
    return `with ${shadeDescription} and ${vegetationDescription} providing little cooling`
  }
  return `with ${shadeDescription} and ${vegetationDescription} providing some cooling`
}

function describeShade(level: PercentageFactorLevel) {
  return level === 'low' ? 'limited shade' : level === 'moderate' ? 'moderate shade' : 'good shade'
}

function describeVegetation(level: PercentageFactorLevel) {
  return level === 'low'
    ? 'limited vegetation'
    : level === 'moderate'
      ? 'moderate vegetation'
      : 'abundant vegetation'
}

function joinWithAnd(items: string[]) {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

