import type { HeatZone } from '../data/heatZones'
import {
  percentageFactorLabel,
  percentageFactorLevel,
  type HeatExposureBreakdown,
} from './heatExposure'

type IntelligenceItem = {
  label: string
  priority: number
}

export type ZoneIntelligence = {
  attentionSummary: string
  keyHeatDrivers: string[]
  coolingConditions: string
  recommendedIntervention: string
  interventionWhy: string
  recommendedInterventions: string[]
}

export function getZoneIntelligence(zone: HeatZone): ZoneIntelligence {
  const { factors, heatExposure } = zone
  const keyHeatDrivers = getHeatDrivers(factors, heatExposure)
  const recommendations = getRecommendations(factors)
  const sortedRecommendations = recommendations.sort((a, b) => b.priority - a.priority)
  const recommendedIntervention = sortedRecommendations[0].label

  return {
    attentionSummary: describeAttention(keyHeatDrivers),
    keyHeatDrivers,
    coolingConditions: describeCoolingConditions(factors.shadePct, factors.vegetationPct),
    recommendedIntervention,
    interventionWhy: describeInterventionWhy(recommendedIntervention, factors),
    recommendedInterventions: sortedRecommendations
      .slice(0, 3)
      .map(({ label }) => label),
  }
}

function describeAttention(drivers: string[]) {
  const driverSummary = joinWithAnd(drivers.map((driver) => driver.toLowerCase()))
  return `This zone needs attention because of ${driverSummary}.`
}

function describeInterventionWhy(intervention: string, factors: HeatZone['factors']) {
  if (intervention.includes('pedestrian')) {
    return "This targets the zone's high pedestrian density by directing cooling toward the highest-footfall areas."
  }
  if (intervention.includes('solar')) {
    return `This directly targets the zone's simulated ${factors.solarExposurePct}% solar exposure by adding shade where heat load is highest.`
  }
  if (intervention.includes('shaded')) {
    return `This addresses the zone's limited simulated shade coverage of ${factors.shadePct}%, adding cooling where it is currently most limited.`
  }
  if (intervention.includes('vegetation')) {
    return `This addresses the zone's limited simulated vegetation coverage of ${factors.vegetationPct}%, adding a cooling condition that is currently constrained.`
  }
  return `This supports the zone's existing simulated shade and vegetation conditions, helping preserve the cooling they provide.`
}

function getHeatDrivers(
  factors: HeatZone['factors'],
  heatExposure: HeatExposureBreakdown,
) {
  const candidates: IntelligenceItem[] = [
    {
      label: `${describeTemperature(heatExposure.normalized.temperature)} temperature`,
      priority: heatExposure.normalized.temperature,
    },
    ...percentageDriver('solar exposure', factors.solarExposurePct, 0.55),
    ...percentageDriver('pedestrian density', factors.pedestrianDensityPct, 0.55),
    ...percentageDriver('humidity', factors.humidityPct, 0.55),
  ]

  if (heatExposure.normalized.buildingDensity !== null) {
    candidates.push({
      label: `${describePercentage(heatExposure.normalized.buildingDensity)} building density`,
      priority: heatExposure.normalized.buildingDensity,
    })
  }

  const drivers = candidates
    .filter((candidate) => candidate.priority >= 0.55)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3)

  if (drivers.length > 0) return drivers.map(({ label }) => label)

  return candidates
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 1)
    .map(({ label }) => label)
}

function percentageDriver(label: string, value: number, threshold: number) {
  const normalized = value / 100
  return normalized >= threshold
    ? [{ label: `${describePercentage(normalized)} ${label}`, priority: normalized }]
    : []
}

function getRecommendations(factors: HeatZone['factors']): IntelligenceItem[] {
  const recommendations: IntelligenceItem[] = []

  if (factors.shadePct < 25) {
    recommendations.push({ label: 'Add shaded pedestrian structures.', priority: 1.2 - factors.shadePct / 100 })
  }
  if (factors.vegetationPct < 25) {
    recommendations.push({ label: 'Increase tree canopy and vegetation.', priority: 1.15 - factors.vegetationPct / 100 })
  }
  if (factors.solarExposurePct >= 50) {
    recommendations.push({
      label: 'Introduce additional shade structures in high-solar areas.',
      priority: factors.solarExposurePct / 100,
    })
  }
  if (factors.pedestrianDensityPct >= 50) {
    recommendations.push({
      label: 'Prioritize cooling along high-footfall pedestrian corridors.',
      priority: factors.pedestrianDensityPct / 100,
    })
  }

  if (recommendations.length < 2) {
    recommendations.push({
      label: 'Protect existing shade and vegetation in this zone.',
      priority: 0.2,
    })
  }

  return recommendations
}

function describeCoolingConditions(shadePct: number, vegetationPct: number) {
  const shadeLevel = percentageFactorLevel(shadePct)
  const vegetationLevel = percentageFactorLevel(vegetationPct)
  const shade = `${describeShade(shadeLevel)} shade`
  const vegetation = `${describeVegetation(vegetationLevel)} vegetation`

  if (shadeLevel === 'low' && vegetationLevel === 'low') {
    return 'Limited shade and vegetation provide little cooling.'
  }
  if (shadeLevel === 'high' && vegetationLevel === 'high') {
    return 'Good shade and abundant vegetation provide stronger cooling.'
  }
  if (shadeLevel === 'high' && vegetationLevel === 'low') {
    return 'Good shade provides some cooling despite limited vegetation.'
  }
  if (shadeLevel === 'low' && vegetationLevel === 'high') {
    return 'Abundant vegetation provides some cooling despite limited shade.'
  }
  return `${capitalize(shade)} and ${vegetation} provide some cooling.`
}

function describeTemperature(value: number) {
  return value >= 0.75 ? 'High' : value >= 0.55 ? 'Elevated' : value >= 0.35 ? 'Moderate' : 'Low'
}

function describePercentage(value: number | ReturnType<typeof percentageFactorLevel>) {
  if (typeof value === 'number') return capitalize(percentageFactorLabel(value * 100))
  return value === 'high' ? 'High' : value === 'moderate' ? 'Moderate' : 'Low'
}

function describeVegetation(level: ReturnType<typeof percentageFactorLevel>) {
  return level === 'high' ? 'abundant' : level === 'moderate' ? 'moderate' : 'limited'
}

function describeShade(level: ReturnType<typeof percentageFactorLevel>) {
  return level === 'high' ? 'good' : level === 'moderate' ? 'moderate' : 'limited'
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function joinWithAnd(values: string[]) {
  if (values.length <= 1) return values[0] ?? 'the current heat conditions'
  if (values.length === 2) return `${values[0]} and ${values[1]}`
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`
}