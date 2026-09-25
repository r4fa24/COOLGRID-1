export type RouteCoordinate = [number, number]

export type RouteNode = {
  id: string
  label: string
  coordinate: RouteCoordinate
}

const CENTER = { lng: 54.3773, lat: 24.4539 }

/** Trip-planner start and destination points. Routes between them are searched
 *  on the baked walking network in `walkNetwork.ts`. */
export const ROUTE_NODES: RouteNode[] = [
  { id: 'corniche', label: 'Corniche', coordinate: [54.354, 24.472] },
  { id: 'waterfront', label: 'Marina Mall', coordinate: [54.370, 24.466] },
  { id: 'city-center', label: 'Abu Dhabi Mall', coordinate: [CENTER.lng, CENTER.lat] },
  { id: 'park', label: 'Al Bateen', coordinate: [54.391, 24.463] },
  { id: 'business', label: 'Al Maryah Island', coordinate: [54.398, 24.450] },
  { id: 'residential', label: 'Al Khalidiyah', coordinate: [54.386, 24.439] },
  { id: 'market', label: 'Qasr Al Watan', coordinate: [54.364, 24.446] },
  { id: 'university', label: 'Abu Dhabi University', coordinate: [54.373, 24.438] },
]
