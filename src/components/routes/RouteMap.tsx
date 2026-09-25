import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl'
import type { GeoJSONSource, Map as MapInstance } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { RouteNode } from '../../data/routeNetwork'
import { WALK_EDGES } from '../../data/walkNetwork'
import { planRoutesFrom, remainingExposure, type PlannedRoute, type RouteComparison } from '../../lib/routePlanning'
import '../map/maplibreWorker'
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
const NETWORK_SOURCE = 'walking-network'
/** How often navigation re-plans the trip still ahead of the walker. */
const REASSESS_INTERVAL_MS = 2_000
/** Share of the remaining exposure a re-planned alternative must save, plus a
 *  floor in score points, before it is offered. Relative so the same rule fits
 *  a walk started on the fastest route and one already on the CoolGrid route. */
const MIN_REROUTE_EXPOSURE_RELIEF = 4
const MIN_REROUTE_EXPOSURE_GAIN = 1.5
/** An alternative sharing more of the path ahead than this is the same walk. */
const MAX_SHARED_FRACTION = 0.8

export function RouteMap({ comparison, from, to, selectedRoute, currentLocation, startRequest, onReroute, generatedRoute, onGeneratedRoute }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapInstance | null>(null)
  const markersRef = useRef<Marker[]>([])
  const selectedRouteRef = useRef(selectedRoute)
  const rerouteActionsRef = useRef<{ takeCoolerRoute: () => void; keepCurrentRoute: () => void } | null>(null)
  const [rerouteOffer, setRerouteOffer] = useState<{ exposureReduction: number } | null>(null)

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
      map.addSource(NETWORK_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: WALK_EDGES.map((edge) => lineFeature(edge[5], 'network')) },
      })
      map.addLayer({ id: 'walking-network', type: 'line', source: NETWORK_SOURCE, minzoom: 13.5, paint: { 'line-color': '#94a3b8', 'line-width': 1, 'line-opacity': 0.22 } })
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
    const selected = comparison?.[selectedRouteRef.current === 'fastest' ? 'fastest' : 'heatWise']
    const route = selected ? withLeadIn(selected, currentLocation) : null
    const coordinates = route?.coordinates ?? []
    if (!map || !route || startRequest === 0 || coordinates.length < 2) return

    let animationFrame = 0
    let progressMarker: Marker | undefined
    let routeCoordinatesForAnimation = coordinates
    /** The route the walker is on right now — the reference every reassessment
     *  is measured against, whichever option they started with. */
    let followedRoute = route
    let routeProgress = 0
    let startedAt = performance.now()
    let animationDuration = 10_000
    let paused = false
    let declined = false
    let cleanedUp = false
    let lastAssessedAt = 0
    let offeredRoute: PlannedRoute | null = null
    const markerElement = document.createElement('div')
    markerElement.className = 'route-progress-marker'
    markerElement.setAttribute('aria-label', 'Route progress')
    markerElement.textContent = '●'

    const startAnimation = () => {
      if (!map.isStyleLoaded()) return
      progressMarker = new Marker({ element: markerElement }).setLngLat(coordinates[0]).addTo(map)
      startedAt = performance.now()
      lastAssessedAt = startedAt

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
        if (!declined && progress < 0.9 && timestamp - lastAssessedAt >= REASSESS_INTERVAL_MS) {
          lastAssessedAt = timestamp
          const offer = coolerRouteAhead(
            progressMarker?.getLngLat(),
            to?.id,
            routeCoordinatesForAnimation.slice(segmentIndex),
            remainingExposure(followedRoute, segmentIndex) ?? 0,
          )
          if (offer) {
            offeredRoute = offer.route
            paused = true
            setRerouteOffer({ exposureReduction: offer.exposureReduction })
            return
          }
        }
        if (progress < 1) animationFrame = requestAnimationFrame(animate)
      }

      rerouteActionsRef.current = {
        takeCoolerRoute: () => {
          if (cleanedUp || !progressMarker || !offeredRoute) return
          const remainingCoordinates = offeredRoute.coordinates
          if (remainingCoordinates.length < 2) return
          routeCoordinatesForAnimation = remainingCoordinates
          followedRoute = offeredRoute
          progressMarker.setLngLat(remainingCoordinates[0])
          animationDuration = Math.max(2_500, 10_000 * (1 - routeProgress))
          startedAt = performance.now()
          lastAssessedAt = performance.now()
          paused = false
          setRerouteOffer(null)
          onGeneratedRoute(offeredRoute)
          onReroute('coolGrid')
          offeredRoute = null
          animationFrame = requestAnimationFrame(animate)
        },
        keepCurrentRoute: () => {
          if (cleanedUp) return
          declined = true
          offeredRoute = null
          startedAt = performance.now() - routeProgress * animationDuration
          paused = false
          setRerouteOffer(null)
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
      setRerouteOffer(null)
    }
  }, [comparison, currentLocation, startRequest, to, onReroute, onGeneratedRoute])

  return (
    <div ref={containerRef} className="relative h-full min-h-96 w-full">
      {rerouteOffer && (
        <div className="absolute top-4 left-1/2 z-10 w-[min(20rem,calc(100%-2rem))] -translate-x-1/2 rounded-2xl bg-slate-900/95 px-4 py-3 text-white shadow-lg backdrop-blur-sm">
          <p className="text-sm font-semibold">☀️ Cooler route available</p>
          <p className="mt-0.5 text-xs text-slate-300">
            About {rerouteOffer.exposureReduction}% lower estimated exposure for the rest of the trip.
          </p>
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

/** Reassessment done while navigating: re-plans the trip still ahead of the
 *  walker and reports a cooler alternative only when it is meaningfully cooler
 *  than the walk they have left and actually leaves the path being walked. The
 *  comparison is against the route currently being followed, so it works the
 *  same whether the walker started on the fastest or the CoolGrid route. */
function coolerRouteAhead(
  position: { lng: number; lat: number } | undefined,
  toId: string | undefined,
  pathAhead: RouteCoordinate[],
  currentExposure: number,
) {
  if (!position || !toId || currentExposure <= 0) return null
  const ahead = planRoutesFrom([position.lng, position.lat], toId)
  if (!ahead) return null
  const candidate = ahead.heatWise
  if (candidate.coordinates.length < 2) return null
  const gain = currentExposure - candidate.exposure
  const relief = (gain / currentExposure) * 100
  if (gain < MIN_REROUTE_EXPOSURE_GAIN || relief < MIN_REROUTE_EXPOSURE_RELIEF) return null
  if (sharedFraction(candidate.coordinates, pathAhead) > MAX_SHARED_FRACTION) return null
  return { route: candidate, exposureReduction: Math.round(relief) }
}

/** The walk starts wherever the walker is, which may be off the planned route. */
function withLeadIn(route: PlannedRoute, currentLocation: { latitude: number; longitude: number } | null) {
  if (!currentLocation) return route
  return {
    ...route,
    coordinates: [[currentLocation.longitude, currentLocation.latitude] as RouteCoordinate, ...route.coordinates],
    segments: [{ meters: 0, exposure: route.segments[0]?.exposure ?? route.exposure }, ...route.segments],
  }
}

function sharedFraction(candidate: RouteCoordinate[], walked: RouteCoordinate[]) {
  const keys = new Set(walked.map((coordinate) => coordinate.join(',')))
  return candidate.filter((coordinate) => keys.has(coordinate.join(','))).length / candidate.length
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
