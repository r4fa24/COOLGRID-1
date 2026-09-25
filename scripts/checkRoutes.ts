import { ROUTE_NODES } from '../src/data/routeNetwork'
import { planRoutes } from '../src/lib/routePlanning'

let same = 0
let total = 0
const started = Date.now()
for (const from of ROUTE_NODES) {
  for (const to of ROUTE_NODES) {
    if (from.id === to.id) continue
    const comparison = planRoutes(from.id, to.id)
    if (!comparison) continue
    total += 1
    const identical =
      JSON.stringify(comparison.fastest.coordinates) === JSON.stringify(comparison.heatWise.coordinates)
    if (identical) same += 1
    const shared = sharedFraction(comparison.fastest.coordinates, comparison.heatWise.coordinates)
    console.log(
      `${from.id.padEnd(12)} -> ${to.id.padEnd(12)} identical=${identical} shared=${(shared * 100).toFixed(0)}% ` +
        `fast(${comparison.fastest.distanceMeters}m, ${comparison.fastest.walkingMinutes}min, exp ${comparison.fastest.exposure}) ` +
        `cool(${comparison.heatWise.distanceMeters}m, ${comparison.heatWise.walkingMinutes}min, exp ${comparison.heatWise.exposure}) ` +
        `reduction=${comparison.exposureReduction}`,
    )
  }
}
console.log(`identical geometry: ${same}/${total} — ${Date.now() - started}ms total`)

function sharedFraction(a: [number, number][], b: [number, number][]) {
  const keys = new Set(b.map((coordinate) => coordinate.join(',')))
  return a.filter((coordinate) => keys.has(coordinate.join(','))).length / a.length
}
