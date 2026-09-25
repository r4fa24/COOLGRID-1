/**
 * Walking route planner for CoolGrid Routes.
 *
 * Both routes are searched independently on the same baked OpenStreetMap
 * pedestrian network (`src/data/walkNetwork.ts`) with Dijkstra, and they only
 * differ in the edge cost they minimise:
 *
 *   fastest   cost = meters
 *   cool      cost = meters * (1 + heatWeight * max(0, exposure - comfort)/100)
 *
 * Only exposure above a comfortable level is penalised, so walking further
 * through shaded or planted streets stays cheap while crossing an exposed
 * arterial gets expensive — that is what lets a cooler detour win. Heat
 * exposure therefore influences which streets the cool route takes, rather
 * than being scored after the fact. The cool search is run for a few increasing
 * heat weights and the best result that stays inside the detour cap wins — a
 * stronger weight is only adopted when it actually buys lower exposure.
 *
 * Segment exposure comes from the existing Heat Exposure Score engine: the
 * simulated zone factors around the segment are interpolated, then shifted by
 * how much of the segment runs through greenery/shade (`greenFraction` baked
 * into the network) and by its road class. No exposure model is duplicated
 * here.
 */

import { HEAT_ZONES } from '../data/heatZones'
import type { HeatZoneFactors } from '../data/heatZones'
import { ROUTE_NODES, type RouteCoordinate } from '../data/routeNetwork'
import { WALK_EDGES, WALK_NODES } from '../data/walkNetwork'
import { calculateHeatExposure } from './heatExposure'

const WALKING_SPEED_METERS_PER_MINUTE = 80
/** How much longer the cool route may be than the fastest one. */
const MAX_COOL_DETOUR_MULTIPLIER = 1.6
/** Heat weights tried for the cool search, from a gentle to a strong bias. */
const HEAT_WEIGHTS = [1, 2.5, 5, 9, 16]
/** Exposure the walker tolerates for free; only the excess is penalised. */
const COMFORT_EXPOSURE = 35
/** An alternative only counts as cooler when it beats this many score points. */
const MIN_EXPOSURE_GAIN = 1

export type PlannedRoute = {
  nodeIds: string[]
  coordinates: RouteCoordinate[]
  distanceMeters: number
  walkingMinutes: number
  exposure: number
}

export type RouteComparison = {
  fastest: PlannedRoute
  heatWise: PlannedRoute
  exposureReduction: number | null
}

type GraphEdge = {
  to: number
  meters: number
  exposure: number
  coordinates: RouteCoordinate[]
}

// ---------------------------------------------------------------------------
// Graph, built once from the baked network.
// ---------------------------------------------------------------------------

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

let cachedAdjacency: GraphEdge[][] | null = null

/** Built on first use: scoring every segment is a one-off cost. */
function graph() {
  if (cachedAdjacency) return cachedAdjacency
  const adjacency: GraphEdge[][] = WALK_NODES.map(() => [])
  for (const [from, to, meters, greenFraction, highway, coordinates] of WALK_EDGES) {
    const exposure = segmentExposure(coordinates, greenFraction, highway)
    adjacency[from].push({ to, meters, exposure, coordinates })
    adjacency[to].push({ to: from, meters, exposure, coordinates: [...coordinates].reverse() })
  }
  cachedAdjacency = adjacency
  return adjacency
}

/** POI ids from the trip planner, snapped onto the walking network. */
const snappedPoiNodes = new Map(
  ROUTE_NODES.map((node) => [node.id, nearestWalkNode(node.coordinate)] as const),
)

export function planRoutes(fromId: string, toId: string): RouteComparison | null {
  if (fromId === toId) return null
  const source = snappedPoiNodes.get(fromId)
  const target = snappedPoiNodes.get(toId)
  if (source === undefined || target === undefined) return null
  return compareRoutes(source, target)
}

/** Cool route from an arbitrary position (a walker mid-trip) to a planner POI. */
export function planCoolRouteFrom(coordinate: RouteCoordinate, toId: string): PlannedRoute | null {
  const target = snappedPoiNodes.get(toId)
  if (target === undefined) return null
  const comparison = compareRoutes(nearestWalkNode(coordinate), target)
  return comparison?.heatWise ?? null
}

function compareRoutes(source: number, target: number): RouteComparison | null {
  if (source === target) return null
  const fastest = search(source, target, 0)
  if (!fastest) return null

  const distanceLimit = fastest.distanceMeters * MAX_COOL_DETOUR_MULTIPLIER
  const heatWise = HEAT_WEIGHTS.reduce((best, heatWeight) => {
    const candidate = search(source, target, heatWeight)
    if (!candidate || candidate.distanceMeters > distanceLimit) return best
    if (candidate.exposure > fastest.exposure - MIN_EXPOSURE_GAIN) return best
    return candidate.exposure < best.exposure ? candidate : best
  }, fastest)

  const exposureReduction =
    heatWise !== fastest && fastest.exposure > 0
      ? Math.round(((fastest.exposure - heatWise.exposure) / fastest.exposure) * 100)
      : null

  return { fastest, heatWise, exposureReduction }
}

/** Dijkstra over the walking network. `heatWeight` of 0 is the fastest route. */
function search(source: number, target: number, heatWeight: number): PlannedRoute | null {
  const adjacency = graph()
  const best = new Float64Array(WALK_NODES.length).fill(Number.POSITIVE_INFINITY)
  const cameFrom = new Map<number, { node: number; edge: GraphEdge }>()
  const queue = new MinHeap()
  best[source] = 0
  queue.push(source, 0)

  while (queue.size > 0) {
    const { node, cost } = queue.pop()
    if (cost > best[node]) continue
    if (node === target) break
    for (const edge of adjacency[node]) {
      const next =
        cost + edge.meters * (1 + (heatWeight * Math.max(0, edge.exposure - COMFORT_EXPOSURE)) / 100)
      if (next >= best[edge.to]) continue
      best[edge.to] = next
      cameFrom.set(edge.to, { node, edge })
      queue.push(edge.to, next)
    }
  }

  if (!Number.isFinite(best[target])) return null

  const traversals: GraphEdge[] = []
  const nodeIds: number[] = [target]
  let current = target
  while (current !== source) {
    const step = cameFrom.get(current)
    if (!step) return null
    traversals.push(step.edge)
    current = step.node
    nodeIds.push(current)
  }
  traversals.reverse()
  nodeIds.reverse()

  return buildRoute(traversals, nodeIds)
}

function buildRoute(traversals: GraphEdge[], nodeIds: number[]): PlannedRoute {
  const coordinates = traversals.reduce<RouteCoordinate[]>(
    (result, edge, index) => (index === 0 ? [...edge.coordinates] : [...result, ...edge.coordinates.slice(1)]),
    [],
  )
  const distanceMeters = traversals.reduce((total, edge) => total + edge.meters, 0)
  const weightedExposure = traversals.reduce((total, edge) => total + edge.meters * edge.exposure, 0)

  return {
    nodeIds: nodeIds.map(String),
    coordinates,
    distanceMeters: Math.round(distanceMeters),
    walkingMinutes: Math.max(1, Math.round(distanceMeters / WALKING_SPEED_METERS_PER_MINUTE)),
    exposure: distanceMeters > 0 ? Math.round(weightedExposure / distanceMeters) : 0,
  }
}

// ---------------------------------------------------------------------------
// Segment exposure
// ---------------------------------------------------------------------------

/** Greenery/shade shifts applied to the surrounding zone factors at 100% cover. */
const GREEN_FACTOR_SHIFT = {
  shadePct: 38,
  vegetationPct: 45,
  solarExposurePct: -26,
  temperatureC: -1.4,
} as const

/** Wide arterials are exposed; footpaths and alleys catch more shade. */
const HIGHWAY_SHADE_BONUS: Record<string, number> = {
  footway: 8,
  path: 8,
  steps: 10,
  pedestrian: 6,
  living_street: 5,
  service: 4,
  residential: 3,
  track: 0,
  unclassified: 0,
  tertiary: -2,
  secondary: -5,
  primary: -8,
  trunk: -10,
}

function segmentExposure(coordinates: RouteCoordinate[], greenFraction: number, highway: string) {
  const midpoint = coordinates[Math.floor(coordinates.length / 2)] ?? coordinates[0]
  const zoneFactors = interpolatedZoneFactors(midpoint)
  const shadeBonus = HIGHWAY_SHADE_BONUS[highway] ?? 0

  return calculateHeatExposure({
    ...zoneFactors,
    shadePct: clamp(zoneFactors.shadePct + GREEN_FACTOR_SHIFT.shadePct * greenFraction + shadeBonus, 0, 100),
    vegetationPct: clamp(zoneFactors.vegetationPct + GREEN_FACTOR_SHIFT.vegetationPct * greenFraction, 0, 100),
    solarExposurePct: clamp(
      zoneFactors.solarExposurePct + GREEN_FACTOR_SHIFT.solarExposurePct * greenFraction - shadeBonus * 0.5,
      0,
      100,
    ),
    temperatureC: zoneFactors.temperatureC + GREEN_FACTOR_SHIFT.temperatureC * greenFraction,
  }).score
}

/** Inverse-distance weighting of the nearest simulated zones, so exposure
 *  varies smoothly along a street instead of snapping at hex borders. */
function interpolatedZoneFactors(coordinate: RouteCoordinate): HeatZoneFactors {
  const neighbours = HEAT_ZONES.map((zone) => ({
    zone,
    distance: Math.max(1e-9, squaredDistance(coordinate, [zone.center.lng, zone.center.lat])),
  }))
    .sort((first, second) => first.distance - second.distance)
    .slice(0, 3)

  const totalWeight = neighbours.reduce((total, neighbour) => total + 1 / neighbour.distance, 0)
  const weighted = (pick: (factors: HeatZoneFactors) => number) =>
    neighbours.reduce((total, neighbour) => total + pick(neighbour.zone.factors) / neighbour.distance, 0) /
    totalWeight

  return {
    temperatureC: weighted((factors) => factors.temperatureC),
    humidityPct: weighted((factors) => factors.humidityPct),
    solarExposurePct: weighted((factors) => factors.solarExposurePct),
    shadePct: weighted((factors) => factors.shadePct),
    vegetationPct: weighted((factors) => factors.vegetationPct),
    pedestrianDensityPct: weighted((factors) => factors.pedestrianDensityPct),
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function nearestWalkNode(coordinate: RouteCoordinate) {
  let nearest = 0
  let nearestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < WALK_NODES.length; index += 1) {
    const distance = squaredDistance(coordinate, WALK_NODES[index])
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearest = index
    }
  }
  return nearest
}

function squaredDistance(first: RouteCoordinate, second: RouteCoordinate) {
  const longitude = (first[0] - second[0]) * Math.cos((first[1] * Math.PI) / 180)
  const latitude = first[1] - second[1]
  return longitude * longitude + latitude * latitude
}

/** Binary heap keyed on cost — a plain array sort is too slow for this graph. */
class MinHeap {
  private nodes: number[] = []
  private costs: number[] = []

  get size() {
    return this.nodes.length
  }

  push(node: number, cost: number) {
    this.nodes.push(node)
    this.costs.push(cost)
    let index = this.nodes.length - 1
    while (index > 0) {
      const parent = (index - 1) >> 1
      if (this.costs[parent] <= this.costs[index]) break
      this.swap(parent, index)
      index = parent
    }
  }

  pop() {
    const node = this.nodes[0]
    const cost = this.costs[0]
    const lastNode = this.nodes.pop() as number
    const lastCost = this.costs.pop() as number
    if (this.nodes.length > 0) {
      this.nodes[0] = lastNode
      this.costs[0] = lastCost
      let index = 0
      while (true) {
        const left = index * 2 + 1
        const right = left + 1
        let smallest = index
        if (left < this.costs.length && this.costs[left] < this.costs[smallest]) smallest = left
        if (right < this.costs.length && this.costs[right] < this.costs[smallest]) smallest = right
        if (smallest === index) break
        this.swap(smallest, index)
        index = smallest
      }
    }
    return { node, cost }
  }

  private swap(first: number, second: number) {
    ;[this.nodes[first], this.nodes[second]] = [this.nodes[second], this.nodes[first]]
    ;[this.costs[first], this.costs[second]] = [this.costs[second], this.costs[first]]
  }
}
