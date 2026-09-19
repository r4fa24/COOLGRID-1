import { HEAT_ZONES } from '../data/heatZones'
import { ROUTE_EDGES, ROUTE_NODES, type RouteCoordinate, type RouteEdge } from '../data/routeNetwork'

const WALKING_SPEED_METERS_PER_MINUTE = 80
const MAX_HEATWISE_TIME_MULTIPLIER = 1.25

type Traversal = { edge: RouteEdge; from: string; to: string }

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

const zoneScores = new Map(HEAT_ZONES.map((zone) => [zone.id, zone.heatExposure.score]))

export function planRoutes(fromId: string, toId: string): RouteComparison | null {
  if (fromId === toId) return null

  const paths = findPaths(fromId, toId)
  if (paths.length === 0) return null

  const routes = paths.map(buildRoute)
  const fastest = routes.reduce((best, route) =>
    route.distanceMeters < best.distanceMeters ? route : best,
  )
  const timeLimit = fastest.distanceMeters * MAX_HEATWISE_TIME_MULTIPLIER
  const candidates = routes.filter((route) => route.distanceMeters <= timeLimit)
  const heatWise = candidates.reduce((best, route) => {
    if (route.exposure < best.exposure) return route
    if (route.exposure === best.exposure && route.distanceMeters < best.distanceMeters) return route
    return best
  }, fastest)
  const exposureReduction =
    heatWise.exposure < fastest.exposure && fastest.exposure > 0
      ? Math.round(((fastest.exposure - heatWise.exposure) / fastest.exposure) * 100)
      : null

  return { fastest, heatWise, exposureReduction }
}

function findPaths(fromId: string, toId: string) {
  const traversals = new Map<string, Traversal[]>()
  for (const edge of ROUTE_EDGES) {
    const forward = { edge, from: edge.from, to: edge.to }
    const reverse = { edge, from: edge.to, to: edge.from }
    traversals.set(edge.from, [...(traversals.get(edge.from) ?? []), forward])
    traversals.set(edge.to, [...(traversals.get(edge.to) ?? []), reverse])
  }

  const paths: Traversal[][] = []
  const walk = (nodeId: string, visited: Set<string>, path: Traversal[]) => {
    if (nodeId === toId) {
      paths.push(path)
      return
    }
    for (const traversal of traversals.get(nodeId) ?? []) {
      if (visited.has(traversal.to) || path.length >= ROUTE_NODES.length - 1) continue
      walk(traversal.to, new Set([...visited, traversal.to]), [...path, traversal])
    }
  }
  walk(fromId, new Set([fromId]), [])
  return paths
}

function buildRoute(path: Traversal[]): PlannedRoute {
  const coordinates = path.reduce<RouteCoordinate[]>((result, traversal, index) => {
    const points = traversal.from === traversal.edge.from ? traversal.edge.coordinates : [...traversal.edge.coordinates].reverse()
    return index === 0 ? [...points] : [...result, ...points.slice(1)]
  }, [])
  const distanceMeters = path.reduce((total, traversal) => total + traversal.edge.distanceMeters, 0)
  const weightedExposure = path.reduce(
    (total, traversal) => total + traversal.edge.distanceMeters * edgeExposure(traversal.edge),
    0,
  )

  return {
    nodeIds: [path[0]?.from, ...path.map((traversal) => traversal.to)].filter(Boolean),
    coordinates,
    distanceMeters,
    walkingMinutes: Math.max(1, Math.round(distanceMeters / WALKING_SPEED_METERS_PER_MINUTE)),
    exposure: Math.round(weightedExposure / distanceMeters),
  }
}

function edgeExposure(edge: RouteEdge) {
  const scores = edge.heatZoneIds.map((zoneId) => zoneScores.get(zoneId)).filter((score): score is number => score !== undefined)
  return scores.length > 0 ? scores.reduce((total, score) => total + score, 0) / scores.length : 0
}