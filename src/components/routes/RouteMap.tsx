import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl'
import type { GeoJSONSource, Map as MapInstance } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { ROUTE_EDGES, type RouteNode } from '../../data/routeNetwork'
import type { PlannedRoute, RouteComparison } from '../../lib/routePlanning'
import { BASEMAP_STYLE_URL } from '../map/mapStyle'

type RouteMapProps = {
  comparison: RouteComparison | null
  from: RouteNode | null
  to: RouteNode | null
  selectedRoute: 'fastest' | 'coolGrid'
  currentLocation: { latitude: number; longitude: number } | null
  startRequest: number
  onReroute: (route: 'fastest' | 'coolGrid') => void
  generatedRoute: PlannedRoute | null
  onGeneratedRoute: (route: PlannedRoute) => void
}

type RouteCoordinate = [number, number]

const ROUTES_SOURCE = 'simulated-routes'

export function RouteMap({ comparison, from, to, selectedRoute, currentLocation, startRequest, onReroute, generatedRoute, onGeneratedRoute }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapInstance | null>(null)
  const markersRef = useRef<Marker[]>([])
  const selectedRouteRef = useRef(selectedRoute)
  const rerouteActionsRef = useRef<{ takeCoolerRoute: () => void; keepCurrentRoute: () => void } | null>(null)
  const [showReroutePrompt, setShowReroutePrompt] = useState(false)

  useEffect(() => {
    selectedRouteRef.current = selectedRoute
  }, [selectedRoute])

  useEffect(() => {
    if (!containerRef.current) return
    const map = new MapLibreMap({
      container: containerRef.current,
      style: BASEMAP_STYLE_URL,
      center: [54.3773, 24.4539],
      zoom: 11.2,
    })
    mapRef.current = map
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')
    map.on('load', () => {
      map.addSource(ROUTES_SOURCE, { type: 'geojson', data: emptyFeatureCollection() })
      map.addLayer({ id: 'simulated-route-network', type: 'line', source: ROUTES_SOURCE, filter: ['==', ['get', 'kind'], 'network'], paint: { 'line-color': '#94a3b8', 'line-width': 1.5, 'line-opacity': 0.45, 'line-dasharray': [2, 2] } })
      map.addLayer({ id: 'fastest-route', type: 'line', source: ROUTES_SOURCE, filter: ['==', ['get', 'kind'], 'fastest'], paint: { 'line-color': '#fb7185', 'line-width': 5, 'line-opacity': 0.9 } })
      map.addLayer({ id: 'heatwise-route', type: 'line', source: ROUTES_SOURCE, filter: ['==', ['get', 'kind'], 'heatwise'], paint: { 'line-color': '#14b8a6', 'line-width': 5, 'line-opacity': 0.95 } })
      map.addLayer({ id: 'generated-cooler-route', type: 'line', source: ROUTES_SOURCE, filter: ['==', ['get', 'kind'], 'generated-cooler'], paint: { 'line-color': '#2dd4bf', 'line-width': 7, 'line-opacity': 0.98 } })
    })
    return () => {
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current = []
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (map.isStyleLoaded()) updateMap(map, comparison, from, to, selectedRoute, currentLocation, generatedRoute, markersRef)
    else map.once('load', () => updateMap(map, comparison, from, to, selectedRoute, currentLocation, generatedRoute, markersRef))
  }, [comparison, from, to, selectedRoute, currentLocation, generatedRoute])

  useEffect(() => {
    const map = mapRef.current
    const route = comparison?.[selectedRouteRef.current === 'fastest' ? 'fastest' : 'heatWise']
    const coordinates = routeCoordinates(route?.coordinates ?? [], currentLocation)
    if (!map || startRequest === 0 || coordinates.length < 2) return

    let animationFrame = 0
    let progressMarker: Marker | undefined
    let routeCoordinatesForAnimation = coordinates
    let routeProgress = 0
    let startedAt = performance.now()
    let animationDuration = 10_000
    let paused = false
    let promptShown = false
    let cleanedUp = false
    const markerElement = document.createElement('div')
    markerElement.className = 'route-progress-marker'
    markerElement.setAttribute('aria-label', 'Route progress')
    markerElement.textContent = '●'

    const startAnimation = () => {
      if (!map.isStyleLoaded()) return
      progressMarker = new Marker({ element: markerElement }).setLngLat(coordinates[0]).addTo(map)

      const animate = (timestamp: number) => {
        if (cleanedUp || paused) return
        const progress = Math.min(1, (timestamp - startedAt) / animationDuration)
        routeProgress = progress
        const segmentPosition = Math.max(0, progress * (routeCoordinatesForAnimation.length - 1))
        const segmentIndex = Math.max(0, Math.min(routeCoordinatesForAnimation.length - 2, Math.floor(segmentPosition)))
        const segmentProgress = segmentPosition - segmentIndex
        const start = routeCoordinatesForAnimation[segmentIndex]
        const end = routeCoordinatesForAnimation[segmentIndex + 1]
        if (!start || !end) return
        progressMarker?.setLngLat([
          start[0] + (end[0] - start[0]) * segmentProgress,
          start[1] + (end[1] - start[1]) * segmentProgress,
        ])
        if (progress >= 0.45 && progress < 0.55 && !promptShown) {
          promptShown = true
          paused = true
          setShowReroutePrompt(true)
        }
        if (progress < 1) animationFrame = requestAnimationFrame(animate)
      }

      rerouteActionsRef.current = {
        takeCoolerRoute: () => {
          if (cleanedUp || !progressMarker) return
          const currentPosition = progressMarker.getLngLat()
          const generated = createGeneratedCoolerRoute(
            comparison,
            routeCoordinatesForAnimation,
            [currentPosition.lng, currentPosition.lat],
          )
          if (!generated) return
          const remainingCoordinates = generated.coordinates
          if (remainingCoordinates.length < 2) return
          routeCoordinatesForAnimation = remainingCoordinates
          progressMarker.setLngLat(remainingCoordinates[0])
          animationDuration = Math.max(2_500, 10_000 * (1 - routeProgress))
          startedAt = performance.now()
          paused = false
          setShowReroutePrompt(false)
          onGeneratedRoute(generated)
          onReroute('coolGrid')
          animationFrame = requestAnimationFrame(animate)
        },
        keepCurrentRoute: () => {
          if (cleanedUp) return
          startedAt = performance.now() - routeProgress * animationDuration
          paused = false
          setShowReroutePrompt(false)
          animationFrame = requestAnimationFrame(animate)
        },
      }

      animationFrame = requestAnimationFrame(animate)
    }

    if (map.isStyleLoaded()) startAnimation()
    else map.once('load', startAnimation)

    return () => {
      cleanedUp = true
      map.off('load', startAnimation)
      cancelAnimationFrame(animationFrame)
      rerouteActionsRef.current = null
      progressMarker?.remove()
      setShowReroutePrompt(false)
    }
  }, [comparison, currentLocation, startRequest, onReroute, onGeneratedRoute])

  return (
    <div ref={containerRef} className="relative h-full min-h-96 w-full">
      {showReroutePrompt && (
        <div className="absolute top-4 left-1/2 z-10 w-[min(20rem,calc(100%-2rem))] -translate-x-1/2 rounded-2xl bg-slate-900/95 px-4 py-3 text-white shadow-lg backdrop-blur-sm">
          <p className="text-sm font-semibold">☀️ Cooler route found</p>
          <p className="mt-0.5 text-xs text-slate-300">Would you like to take it?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full bg-teal-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-teal-300"
              onClick={() => rerouteActionsRef.current?.takeCoolerRoute()}
            >
              Yes, take cooler route
            </button>
            <button
              type="button"
              className="rounded-full border border-white/30 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10"
              onClick={() => rerouteActionsRef.current?.keepCurrentRoute()}
            >
              Keep current route
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function updateMap(
  map: MapInstance,
  comparison: RouteComparison | null,
  from: RouteNode | null,
  to: RouteNode | null,
  selectedRoute: 'fastest' | 'coolGrid',
  currentLocation: { latitude: number; longitude: number } | null,
  generatedRoute: PlannedRoute | null,
  markersRef: MutableRefObject<Marker[]>,
) {
  const source = map.getSource(ROUTES_SOURCE) as GeoJSONSource | undefined
  if (!source) return
  const features = [
    ...ROUTE_EDGES.map((edge) => lineFeature(edge.coordinates, 'network')),
    ...(comparison
      ? [
          lineFeature(routeCoordinates(comparison.fastest.coordinates, currentLocation), 'fastest'),
          lineFeature(routeCoordinates(comparison.heatWise.coordinates, currentLocation), 'heatwise'),
          ...(generatedRoute ? [lineFeature(generatedRoute.coordinates, 'generated-cooler')] : []),
        ]
      : []),
  ]
  source.setData({ type: 'FeatureCollection', features })
  if (map.getLayer('fastest-route')) {
    map.setPaintProperty('fastest-route', 'line-width', selectedRoute === 'fastest' ? 6 : 3)
    map.setPaintProperty('fastest-route', 'line-opacity', selectedRoute === 'fastest' ? 0.95 : 0.22)
  }

  if (map.getLayer('heatwise-route')) {
    map.setPaintProperty('heatwise-route', 'line-width', selectedRoute === 'coolGrid' && !generatedRoute ? 6 : 3)
    map.setPaintProperty('heatwise-route', 'line-opacity', selectedRoute === 'coolGrid' && !generatedRoute ? 0.98 : 0.22)
  }
  if (map.getLayer('generated-cooler-route')) {
    map.setPaintProperty('generated-cooler-route', 'line-width', selectedRoute === 'coolGrid' && generatedRoute ? 7 : 2)
    map.setPaintProperty('generated-cooler-route', 'line-opacity', selectedRoute === 'coolGrid' && generatedRoute ? 0.98 : 0.12)
  }
  markersRef.current.forEach((marker) => marker.remove())
  markersRef.current = []
  if (currentLocation) {
    const markerElement = document.createElement('div')
    markerElement.className = 'route-current-location-marker'
    markerElement.setAttribute('aria-label', 'Current location')
    markerElement.textContent = 'Current location'
    markersRef.current.push(
      new Marker({ element: markerElement })
        .setLngLat([currentLocation.longitude, currentLocation.latitude])
        .addTo(map),
    )
  } else if (from) {
    markersRef.current.push(new Marker({ color: '#0f766e' }).setLngLat(from.coordinate).addTo(map))
  }
  if (to) {
    const destinationMarker = new Marker({ color: '#e11d48' }).setLngLat(to.coordinate).addTo(map)
    destinationMarker.getElement().setAttribute('aria-label', 'Destination')
    markersRef.current.push(destinationMarker)
  }
  if (comparison) {
    const coordinates = [
      ...routeCoordinates(comparison.fastest.coordinates, currentLocation),
      ...routeCoordinates(comparison.heatWise.coordinates, currentLocation),
      ...(currentLocation ? [[currentLocation.longitude, currentLocation.latitude] as [number, number]] : []),
    ]
    const bounds = coordinates.reduce(
      (currentBounds, coordinate) => currentBounds.extend(coordinate),
      new LngLatBounds(coordinates[0], coordinates[0]),
    )
    map.fitBounds(bounds, { padding: 70, duration: 350 })
  }
}

function nearestCoordinateIndex(coordinates: RouteCoordinate[], target: RouteCoordinate) {
  return coordinates.reduce((nearestIndex, coordinate, index) => {
    const nearestDistance = coordinateDistance(coordinates[nearestIndex] ?? coordinates[0], target)
    return coordinateDistance(coordinate, target) < nearestDistance ? index : nearestIndex
  }, 0)
}

function coordinateDistance(first: RouteCoordinate, second: RouteCoordinate) {
  return Math.hypot(first[0] - second[0], first[1] - second[1])
}

function createGeneratedCoolerRoute(
  comparison: RouteComparison | null,
  currentCoordinates: RouteCoordinate[],
  currentPosition: RouteCoordinate,
) {
  if (!comparison || comparison.heatWise.exposure >= comparison.fastest.exposure) return null
  const currentRoute = currentCoordinates.slice(nearestCoordinateIndex(currentCoordinates, currentPosition))
  const coolerRoute = comparison.heatWise.coordinates
  const sourceRoute =
    coordinateDistance(
      coolerRoute[Math.floor(coolerRoute.length / 2)] ?? coolerRoute[0],
      currentRoute[Math.floor(currentRoute.length / 2)] ?? currentRoute[0],
    ) > 0.00001
      ? coolerRoute
      : comparison.fastest.coordinates
  if (sourceRoute.length < 2 || currentRoute.length < 2) return null
  const sourceStart = nearestCoordinateIndex(sourceRoute, currentPosition)
  const sourceRemainder = sourceRoute.slice(sourceStart)
  if (sourceRemainder.length < 2) return null

  const points: RouteCoordinate[] = [currentPosition]
  const sampleCount = Math.max(4, Math.min(8, Math.max(currentRoute.length, sourceRemainder.length)))
  for (let index = 1; index < sampleCount; index += 1) {
    const progress = index / (sampleCount - 1)
    const currentPoint = interpolateCoordinate(currentRoute, progress)
    const coolerPoint = interpolateCoordinate(sourceRemainder, progress)
    const divergence = Math.sin(progress * Math.PI) * 0.7
    points.push([
      currentPoint[0] + (coolerPoint[0] - currentPoint[0]) * divergence,
      currentPoint[1] + (coolerPoint[1] - currentPoint[1]) * divergence,
    ])
  }
  points[points.length - 1] = sourceRemainder[sourceRemainder.length - 1]
  return {
    nodeIds: comparison.heatWise.nodeIds,
    coordinates: points,
    distanceMeters: Math.round(comparison.heatWise.distanceMeters * 1.08),
    walkingMinutes: Math.max(1, Math.round((comparison.heatWise.distanceMeters * 1.08) / 80)),
    exposure: comparison.heatWise.exposure,
  } satisfies PlannedRoute
}

function interpolateCoordinate(coordinates: RouteCoordinate[], progress: number): RouteCoordinate {
  const position = progress * (coordinates.length - 1)
  const index = Math.min(coordinates.length - 2, Math.max(0, Math.floor(position)))
  const fraction = position - index
  const start = coordinates[index] ?? coordinates[0]
  const end = coordinates[index + 1] ?? start
  return [start[0] + (end[0] - start[0]) * fraction, start[1] + (end[1] - start[1]) * fraction]
}

function routeCoordinates(
  coordinates: RouteNode['coordinate'][],
  currentLocation: { latitude: number; longitude: number } | null,
) {
  if (!currentLocation) return coordinates
  return [[currentLocation.longitude, currentLocation.latitude] as [number, number], ...coordinates]
}

function lineFeature(coordinates: RouteNode['coordinate'][], kind: string) {
  return { type: 'Feature' as const, properties: { kind }, geometry: { type: 'LineString' as const, coordinates } }
}

function emptyFeatureCollection() {
  return { type: 'FeatureCollection' as const, features: [] }
}
