export type RouteCoordinate = [number, number]

export type RouteNode = {
  id: string
  label: string
  coordinate: RouteCoordinate
}

export type RouteEdge = {
  id: string
  from: string
  to: string
  distanceMeters: number
  coordinates: RouteCoordinate[]
  heatZoneIds: string[]
}

const CENTER = { lng: 54.3773, lat: 24.4539 }

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

export const ROUTE_EDGES: RouteEdge[] = [
  { id: 'corniche-waterfront', from: 'corniche', to: 'waterfront', distanceMeters: 820, coordinates: [[54.354, 24.472], [54.370, 24.466]], heatZoneIds: ['zone-03', 'zone-04'] },
  { id: 'corniche-market', from: 'corniche', to: 'market', distanceMeters: 760, coordinates: [[54.354, 24.472], [54.364, 24.446]], heatZoneIds: ['zone-06', 'zone-07'] },
  { id: 'corniche-waterfront-cool', from: 'corniche', to: 'waterfront', distanceMeters: 960, coordinates: [[54.354, 24.472], [54.362, 24.469], [54.370, 24.466]], heatZoneIds: ['zone-22', 'zone-23'] },
  { id: 'waterfront-center', from: 'waterfront', to: 'city-center', distanceMeters: 920, coordinates: [[54.370, 24.466], [54.3773, 24.4539]], heatZoneIds: ['zone-14', 'zone-15'] },
  { id: 'waterfront-park', from: 'waterfront', to: 'park', distanceMeters: 1080, coordinates: [[54.370, 24.466], [54.391, 24.463]], heatZoneIds: ['zone-22', 'zone-23'] },
  { id: 'waterfront-center-cool', from: 'waterfront', to: 'city-center', distanceMeters: 1080, coordinates: [[54.370, 24.466], [54.374, 24.460], [54.3773, 24.4539]], heatZoneIds: ['zone-64', 'zone-65'] },
  { id: 'market-center', from: 'market', to: 'city-center', distanceMeters: 950, coordinates: [[54.364, 24.446], [54.3773, 24.4539]], heatZoneIds: ['zone-31', 'zone-32'] },
  { id: 'market-center-cool', from: 'market', to: 'city-center', distanceMeters: 1100, coordinates: [[54.364, 24.446], [54.370, 24.450], [54.3773, 24.4539]], heatZoneIds: ['zone-22', 'zone-23'] },
  { id: 'market-university', from: 'market', to: 'university', distanceMeters: 880, coordinates: [[54.364, 24.446], [54.373, 24.438]], heatZoneIds: ['zone-42', 'zone-43'] },
  { id: 'university-residential', from: 'university', to: 'residential', distanceMeters: 1080, coordinates: [[54.373, 24.438], [54.386, 24.439]], heatZoneIds: ['zone-52', 'zone-53'] },
  { id: 'university-residential-cool', from: 'university', to: 'residential', distanceMeters: 1250, coordinates: [[54.373, 24.438], [54.380, 24.435], [54.386, 24.439]], heatZoneIds: ['zone-64', 'zone-65'] },
  { id: 'university-center', from: 'university', to: 'city-center', distanceMeters: 900, coordinates: [[54.373, 24.438], [54.3773, 24.4539]], heatZoneIds: ['zone-44', 'zone-45'] },
  { id: 'center-residential', from: 'city-center', to: 'residential', distanceMeters: 850, coordinates: [[54.3773, 24.4539], [54.386, 24.439]], heatZoneIds: ['zone-58', 'zone-59'] },
  { id: 'center-residential-cool', from: 'city-center', to: 'residential', distanceMeters: 980, coordinates: [[54.3773, 24.4539], [54.382, 24.448], [54.386, 24.439]], heatZoneIds: ['zone-22', 'zone-23'] },
  { id: 'center-park', from: 'city-center', to: 'park', distanceMeters: 1050, coordinates: [[54.3773, 24.4539], [54.391, 24.463]], heatZoneIds: ['zone-64', 'zone-65'] },
  { id: 'park-business', from: 'park', to: 'business', distanceMeters: 880, coordinates: [[54.391, 24.463], [54.398, 24.450]], heatZoneIds: ['zone-72', 'zone-73'] },
  { id: 'park-business-cool', from: 'park', to: 'business', distanceMeters: 1020, coordinates: [[54.391, 24.463], [54.396, 24.457], [54.398, 24.450]], heatZoneIds: ['zone-22', 'zone-23'] },
  { id: 'residential-business', from: 'residential', to: 'business', distanceMeters: 1160, coordinates: [[54.386, 24.439], [54.398, 24.450]], heatZoneIds: ['zone-80', 'zone-81'] },
]