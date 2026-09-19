import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl'
import type { GeoJSONSource, Map as MapInstance } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, type MutableRefObject } from 'react'
import { ROUTE_EDGES, type RouteNode } from '../../data/routeNetwork'
import type { RouteComparison } from '../../lib/routePlanning'
import { BASEMAP_STYLE_URL } from '../map/mapStyle'

type RouteMapProps = {
  comparison: RouteComparison | null
  from: RouteNode | null
  to: RouteNode | null
}

const ROUTES_SOURCE = 'simulated-routes'

export function RouteMap({ comparison, from, to }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapInstance | null>(null)
  const markersRef = useRef<Marker[]>([])

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
    if (map.isStyleLoaded()) updateMap(map, comparison, from, to, markersRef)
    else map.once('load', () => updateMap(map, comparison, from, to, markersRef))
  }, [comparison, from, to])

  return <div ref={containerRef} className="h-full min-h-96 w-full" />
}

function updateMap(map: MapInstance, comparison: RouteComparison | null, from: RouteNode | null, to: RouteNode | null, markersRef: MutableRefObject<Marker[]>) {
  const source = map.getSource(ROUTES_SOURCE) as GeoJSONSource | undefined
  if (!source) return
  const features = [
    ...ROUTE_EDGES.map((edge) => lineFeature(edge.coordinates, 'network')),
    ...(comparison
      ? [
          lineFeature(comparison.fastest.coordinates, 'fastest'),
          lineFeature(comparison.heatWise.coordinates, 'heatwise'),
        ]
      : []),
  ]
  source.setData({ type: 'FeatureCollection', features })
  markersRef.current.forEach((marker) => marker.remove())
  markersRef.current = []
  if (from) markersRef.current.push(new Marker({ color: '#0f766e' }).setLngLat(from.coordinate).addTo(map))
  if (to) markersRef.current.push(new Marker({ color: '#e11d48' }).setLngLat(to.coordinate).addTo(map))
  if (comparison) {
    const coordinates = [...comparison.fastest.coordinates, ...comparison.heatWise.coordinates]
    const bounds = coordinates.reduce(
      (currentBounds, coordinate) => currentBounds.extend(coordinate),
      new LngLatBounds(coordinates[0], coordinates[0]),
    )
    map.fitBounds(bounds, { padding: 70, duration: 350 })
  }
}

function lineFeature(coordinates: RouteNode['coordinate'][], kind: string) {
  return { type: 'Feature' as const, properties: { kind }, geometry: { type: 'LineString' as const, coordinates } }
}

function emptyFeatureCollection() {
  return { type: 'FeatureCollection' as const, features: [] }
}