/**
 * Bakes the walking network used by CoolGrid Routes into `src/data/walkNetwork.ts`.
 *
 * The app itself never calls a routing or map-data API at runtime: this script
 * is run by hand (`npm run build:walk-network`), snapshots the OpenStreetMap
 * pedestrian network for the Abu Dhabi demo area, and writes it out as a plain
 * TypeScript module.
 *
 * Besides geometry, each edge carries a `greenFraction` (0–1) — how much of the
 * segment runs through or alongside parks, gardens, greenery and water. That is
 * the only extra signal the heat-aware router needs: `src/lib/routePlanning.ts`
 * turns it into shade/vegetation adjustments and scores the segment with the
 * existing Heat Exposure Score engine.
 *
 * Data © OpenStreetMap contributors, ODbL.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

type Coordinate = [number, number]
type OverpassWay = {
  type: string
  id: number
  lat?: number
  lon?: number
  tags?: Record<string, string>
  geometry?: { lat: number; lon: number }[]
}

const HERE = dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = resolve(HERE, '../.cache/overpass')
const OUTPUT_FILE = resolve(HERE, '../src/data/walkNetwork.ts')
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

/** Demo area: the POIs in `routeNetwork.ts` plus a walking-distance margin. */
const BBOX = { south: 24.433, west: 54.348, north: 24.476, east: 54.402 }

const WALKABLE_HIGHWAYS = new Set([
  'footway',
  'path',
  'pedestrian',
  'living_street',
  'residential',
  'service',
  'steps',
  'track',
  'unclassified',
  'tertiary',
  'secondary',
  'primary',
  'trunk',
  'road',
])

/** Segments that are effectively never walkable are dropped outright. */
function isWalkable(tags: Record<string, string>) {
  if (!WALKABLE_HIGHWAYS.has(tags.highway ?? '')) return false
  if (tags.foot === 'no' || tags.access === 'no' || tags.access === 'private') return false
  if (tags.service === 'parking_aisle' || tags.service === 'driveway') return false
  return true
}

const bboxClause = `(${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east})`

const WALK_QUERY = `[out:json][timeout:180];
(way["highway"]${bboxClause};);
out geom;`

const GREEN_QUERY = `[out:json][timeout:180];
(
  way["leisure"~"^(park|garden|pitch|playground)$"]${bboxClause};
  way["landuse"~"^(grass|recreation_ground|forest|village_green)$"]${bboxClause};
  way["natural"~"^(wood|scrub|water)$"]${bboxClause};
);
out geom;`

const TREE_QUERY = `[out:json][timeout:180];
(
  node["natural"="tree"]${bboxClause};
  way["natural"="tree_row"]${bboxClause};
  way["tree_lined"="yes"]${bboxClause};
);
out geom;`

async function overpass(name: string, query: string): Promise<OverpassWay[]> {
  const cacheFile = resolve(CACHE_DIR, `${name}.json`)
  if (existsSync(cacheFile)) {
    return JSON.parse(readFileSync(cacheFile, 'utf8')).elements as OverpassWay[]
  }
  process.stdout.write(`Fetching ${name} from Overpass…\n`)
  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'coolgrid-walk-network-bake' },
    body: new URLSearchParams({ data: query }),
  })
  if (!response.ok) throw new Error(`Overpass ${name} failed: ${response.status}`)
  const payload = await response.text()
  mkdirSync(CACHE_DIR, { recursive: true })
  writeFileSync(cacheFile, payload)
  return JSON.parse(payload).elements as OverpassWay[]
}

// --- geometry helpers -------------------------------------------------------

const EARTH_RADIUS = 6_371_000
const toRadians = (value: number) => (value * Math.PI) / 180

function distanceMeters(from: Coordinate, to: Coordinate) {
  const latitude = toRadians(to[1] - from[1])
  const longitude = toRadians(to[0] - from[0])
  const a =
    Math.sin(latitude / 2) ** 2 +
    Math.sin(longitude / 2) ** 2 * Math.cos(toRadians(from[1])) * Math.cos(toRadians(to[1]))
  return EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function polylineLength(coordinates: Coordinate[]) {
  let total = 0
  for (let index = 1; index < coordinates.length; index += 1) {
    total += distanceMeters(coordinates[index - 1], coordinates[index])
  }
  return total
}

/** Ramer–Douglas–Peucker, tolerance in degrees. */
function simplify(coordinates: Coordinate[], tolerance: number): Coordinate[] {
  if (coordinates.length < 3) return coordinates
  const first = coordinates[0]
  const last = coordinates[coordinates.length - 1]
  let index = -1
  let maxDistance = 0
  for (let i = 1; i < coordinates.length - 1; i += 1) {
    const distance = perpendicularDistance(coordinates[i], first, last)
    if (distance > maxDistance) {
      maxDistance = distance
      index = i
    }
  }
  if (maxDistance <= tolerance || index < 0) return [first, last]
  return [
    ...simplify(coordinates.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplify(coordinates.slice(index), tolerance),
  ]
}

function perpendicularDistance(point: Coordinate, start: Coordinate, end: Coordinate) {
  const x = point[0] - start[0]
  const y = point[1] - start[1]
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(x, y)
  const projection = Math.max(0, Math.min(1, (x * dx + y * dy) / lengthSquared))
  return Math.hypot(x - projection * dx, y - projection * dy)
}

// --- greenery lookup --------------------------------------------------------

type GreenPolygon = { ring: Coordinate[]; bbox: [number, number, number, number] }

/** ~35 m, expressed in degrees — "alongside a park" still counts as shaded. */
const GREEN_BUFFER_DEGREES = 0.00032
/** ~20 m: how far the canopy of a mapped tree or tree row reaches. */
const TREE_BUFFER_DEGREES = 0.00018

function buildGreenIndex(ways: OverpassWay[]) {
  const polygons: GreenPolygon[] = []
  for (const way of ways) {
    const geometry = way.geometry
    if (!geometry || geometry.length < 4) continue
    const ring = geometry.map((point) => [point.lon, point.lat] as Coordinate)
    const longitudes = ring.map((point) => point[0])
    const latitudes = ring.map((point) => point[1])
    polygons.push({
      ring,
      bbox: [Math.min(...longitudes), Math.min(...latitudes), Math.max(...longitudes), Math.max(...latitudes)],
    })
  }
  return polygons
}

function isNearGreen(point: Coordinate, polygons: GreenPolygon[]) {
  for (const polygon of polygons) {
    const [minLng, minLat, maxLng, maxLat] = polygon.bbox
    if (
      point[0] < minLng - GREEN_BUFFER_DEGREES ||
      point[0] > maxLng + GREEN_BUFFER_DEGREES ||
      point[1] < minLat - GREEN_BUFFER_DEGREES ||
      point[1] > maxLat + GREEN_BUFFER_DEGREES
    ) {
      continue
    }
    if (pointInRing(point, polygon.ring)) return true
    if (distanceToRing(point, polygon.ring) <= GREEN_BUFFER_DEGREES) return true
  }
  return false
}

function pointInRing(point: Coordinate, ring: Coordinate[]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersects = yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function distanceToRing(point: Coordinate, ring: Coordinate[]) {
  let nearest = Number.POSITIVE_INFINITY
  for (let i = 1; i < ring.length; i += 1) {
    nearest = Math.min(nearest, perpendicularDistance(point, ring[i - 1], ring[i]))
    if (nearest <= GREEN_BUFFER_DEGREES) return nearest
  }
  return nearest
}

// --- graph ------------------------------------------------------------------

type Chain = { nodes: [string, string]; coordinates: Coordinate[]; highway: string; tags: Record<string, string> }

const key = (coordinate: Coordinate) => `${coordinate[0].toFixed(6)},${coordinate[1].toFixed(6)}`

async function main() {
  const [walkWays, greenWays, treeElements] = await Promise.all([
    overpass('walk', WALK_QUERY),
    overpass('green', GREEN_QUERY),
    overpass('trees', TREE_QUERY),
  ])
  const green = buildGreenIndex(greenWays)
  const trees = buildTreeIndex(treeElements)

  // 1. micro-edges between consecutive OSM geometry points
  type MicroEdge = { from: string; to: string; coordinates: [Coordinate, Coordinate]; highway: string; tags: Record<string, string> }
  const micro: MicroEdge[] = []
  const pointOf = new Map<string, Coordinate>()
  for (const way of walkWays) {
    const tags = way.tags ?? {}
    if (!way.geometry || !isWalkable(tags)) continue
    const coordinates = way.geometry.map((point) => [point.lon, point.lat] as Coordinate)
    for (let index = 1; index < coordinates.length; index += 1) {
      const from = coordinates[index - 1]
      const to = coordinates[index]
      const fromKey = key(from)
      const toKey = key(to)
      if (fromKey === toKey) continue
      pointOf.set(fromKey, from)
      pointOf.set(toKey, to)
      micro.push({ from: fromKey, to: toKey, coordinates: [from, to], highway: tags.highway ?? 'road', tags })
    }
  }

  // 2. contract degree-2 chains into single edges
  const neighbours = new Map<string, MicroEdge[]>()
  for (const edge of micro) {
    neighbours.set(edge.from, [...(neighbours.get(edge.from) ?? []), edge])
    neighbours.set(edge.to, [...(neighbours.get(edge.to) ?? []), edge])
  }
  const isJunction = (nodeKey: string) => (neighbours.get(nodeKey) ?? []).length !== 2

  const visited = new Set<MicroEdge>()
  const chains: Chain[] = []
  for (const start of neighbours.keys()) {
    if (!isJunction(start)) continue
    for (const first of neighbours.get(start) ?? []) {
      if (visited.has(first)) continue
      let current = first
      let node = start
      const coordinates: Coordinate[] = [pointOf.get(start)!]
      const { highway, tags } = first
      while (true) {
        visited.add(current)
        const next = current.from === node ? current.to : current.from
        coordinates.push(pointOf.get(next)!)
        node = next
        if (isJunction(next)) break
        const continuation = (neighbours.get(next) ?? []).find((edge) => edge !== current)
        if (!continuation || visited.has(continuation)) break
        current = continuation
      }
      if (node === start && coordinates.length < 4) continue
      chains.push({ nodes: [start, node], coordinates, highway, tags })
    }
  }

  // 3. keep the largest connected component
  const adjacency = new Map<string, string[]>()
  for (const chain of chains) {
    adjacency.set(chain.nodes[0], [...(adjacency.get(chain.nodes[0]) ?? []), chain.nodes[1]])
    adjacency.set(chain.nodes[1], [...(adjacency.get(chain.nodes[1]) ?? []), chain.nodes[0]])
  }
  const componentOf = new Map<string, number>()
  let components = 0
  for (const node of adjacency.keys()) {
    if (componentOf.has(node)) continue
    const id = components++
    const queue = [node]
    componentOf.set(node, id)
    while (queue.length > 0) {
      const current = queue.pop()!
      for (const neighbour of adjacency.get(current) ?? []) {
        if (componentOf.has(neighbour)) continue
        componentOf.set(neighbour, id)
        queue.push(neighbour)
      }
    }
  }
  const sizes = new Map<number, number>()
  for (const id of componentOf.values()) sizes.set(id, (sizes.get(id) ?? 0) + 1)
  const largest = [...sizes.entries()].reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0]

  // 4. emit nodes + edges
  const nodeIndex = new Map<string, number>()
  const nodeCoordinates: Coordinate[] = []
  const edges: { from: number; to: number; meters: number; green: number; highway: string; coordinates: Coordinate[] }[] = []
  const round = (value: number) => Number(value.toFixed(5))

  for (const chain of chains) {
    if (componentOf.get(chain.nodes[0]) !== largest) continue
    const simplified = simplify(chain.coordinates, 0.00006).map(
      (coordinate) => [round(coordinate[0]), round(coordinate[1])] as Coordinate,
    )
    if (simplified.length < 2) continue
    const meters = Math.round(polylineLength(chain.coordinates))
    if (meters < 1) continue
    const indexOf = (nodeKey: string, coordinate: Coordinate) => {
      const existing = nodeIndex.get(nodeKey)
      if (existing !== undefined) return existing
      const index = nodeCoordinates.length
      nodeIndex.set(nodeKey, index)
      nodeCoordinates.push(coordinate)
      return index
    }
    const from = indexOf(chain.nodes[0], simplified[0])
    const to = indexOf(chain.nodes[1], simplified[simplified.length - 1])
    if (from === to) continue
    edges.push({
      from,
      to,
      meters,
      green: greenFractionFor(chain.coordinates, green, trees),
      highway: chain.highway,
      coordinates: simplified,
    })
  }

  const file = renderModule(nodeCoordinates, edges)
  writeFileSync(OUTPUT_FILE, file)
  process.stdout.write(
    `Wrote ${OUTPUT_FILE}: ${nodeCoordinates.length} nodes, ${edges.length} edges, ${(file.length / 1024).toFixed(0)} kB\n`,
  )
}

/** Mapped trees and tree rows, as points with a canopy radius. */
function buildTreeIndex(elements: OverpassWay[]) {
  const points: Coordinate[] = []
  for (const element of elements) {
    if (element.lat !== undefined && element.lon !== undefined) {
      points.push([element.lon, element.lat])
      continue
    }
    for (const point of element.geometry ?? []) points.push([point.lon, point.lat])
  }
  return points
}

function isNearTree(point: Coordinate, trees: Coordinate[]) {
  return trees.some(
    (tree) =>
      Math.abs(tree[0] - point[0]) <= TREE_BUFFER_DEGREES &&
      Math.abs(tree[1] - point[1]) <= TREE_BUFFER_DEGREES,
  )
}

/** Share of the segment that runs through or alongside greenery / water / trees. */
function greenFractionFor(coordinates: Coordinate[], green: GreenPolygon[], trees: Coordinate[]) {
  const samples: Coordinate[] = []
  for (let index = 1; index < coordinates.length; index += 1) {
    const from = coordinates[index - 1]
    const to = coordinates[index]
    const steps = Math.max(1, Math.round(distanceMeters(from, to) / 25))
    for (let step = 0; step < steps; step += 1) {
      const progress = (step + 0.5) / steps
      samples.push([from[0] + (to[0] - from[0]) * progress, from[1] + (to[1] - from[1]) * progress])
    }
  }
  if (samples.length === 0) return 0
  const shaded = samples.filter((sample) => isNearGreen(sample, green) || isNearTree(sample, trees)).length
  return Number((shaded / samples.length).toFixed(2))
}

function renderModule(
  nodes: Coordinate[],
  edges: { from: number; to: number; meters: number; green: number; highway: string; coordinates: Coordinate[] }[],
) {
  const nodeLines = nodes.map((coordinate) => `[${coordinate[0]},${coordinate[1]}]`).join(',')
  const edgeLines = edges
    .map(
      (edge) =>
        `[${edge.from},${edge.to},${edge.meters},${edge.green},'${edge.highway}',[${edge.coordinates
          .map((coordinate) => `[${coordinate[0]},${coordinate[1]}]`)
          .join(',')}]]`,
    )
    .join(',\n')

  return `/**
 * GENERATED FILE — do not edit by hand.
 * Run \`npm run build:walk-network\` to regenerate (see scripts/buildWalkNetwork.ts).
 *
 * Snapshot of the OpenStreetMap pedestrian network for the Abu Dhabi demo area,
 * baked into the bundle so the app needs no routing or map-data API at runtime.
 * Data © OpenStreetMap contributors, ODbL.
 *
 * Edge tuple: [fromNode, toNode, meters, greenFraction, highwayClass, coordinates]
 * \`greenFraction\` (0–1) is how much of the segment runs through or alongside
 * parks, gardens, greenery or water — the shade signal the heat-aware router
 * feeds into the Heat Exposure Score engine.
 */

export type WalkCoordinate = [number, number]

/** [fromNode, toNode, meters, greenFraction, highwayClass, coordinates] */
export type WalkEdgeTuple = [number, number, number, number, string, WalkCoordinate[]]

export const WALK_NODES: WalkCoordinate[] = [${nodeLines}]

export const WALK_EDGES: WalkEdgeTuple[] = [
${edgeLines},
]
`
}

main().catch((error) => {
  process.stderr.write(`${error}\n`)
  process.exitCode = 1
})
