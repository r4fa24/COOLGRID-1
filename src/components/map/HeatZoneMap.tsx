import { AttributionControl, Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl'
import type { ExpressionSpecification, MapLayerMouseEvent, MapMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { memo, useEffect, useRef, useState } from 'react'
import { DEMO_AREA, HEAT_BANDS, HEAT_ZONE_COLLECTION } from '../../data/heatZones'
import './maplibreWorker'
import { BASEMAP_STYLE_URL } from './mapStyle'

const SOURCE_ID = 'heat-zones'
const FILL_LAYER = 'heat-zones-fill'
const LINE_LAYER = 'heat-zones-line'
const SELECTED_LAYER = 'heat-zones-selected'

const zoneFeatureId = (zoneId: string | null): number | null => {
  if (!zoneId || !zoneId.startsWith('zone-')) return null
  const featureId = Number(zoneId.replace('zone-', ''))
  return Number.isFinite(featureId) ? featureId : null
}

const fillIntensityExpression = [
  'coalesce',
  ['feature-state', 'simulatedIntensity'],
  ['get', 'intensity'],
] as unknown as ExpressionSpecification

const fillColorExpression = [
  'interpolate',
  ['linear'],
  fillIntensityExpression,
  0,
  HEAT_BANDS[0].color,
  0.4,
  HEAT_BANDS[1].color,
  0.6,
  HEAT_BANDS[2].color,
  0.78,
  HEAT_BANDS[3].color,
  0.92,
  HEAT_BANDS[4].color,
] as unknown as ExpressionSpecification

type HeatZoneMapProps = {
  selectedZoneId: string | null
  simulatedScore: number | null
  onSelectZone: (zoneId: string | null) => void
  currentLocation: { latitude: number; longitude: number } | null
}

export const HeatZoneMap = memo(function HeatZoneMap({
  selectedZoneId,
  simulatedScore,
  onSelectZone,
  currentLocation,
}: HeatZoneMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const locationMarkerRef = useRef<Marker | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const selectHandlerRef = useRef(onSelectZone)
  const simulatedZoneRef = useRef<string | null>(null)

  useEffect(() => {
    selectHandlerRef.current = onSelectZone
  }, [onSelectZone])

  useEffect(() => {
    if (!containerRef.current) return

    const map = new MapLibreMap({
      container: containerRef.current,
      style: BASEMAP_STYLE_URL,
      center: [DEMO_AREA.center.lng, DEMO_AREA.center.lat],
      zoom: DEMO_AREA.zoom,
      attributionControl: false,
    })
    mapRef.current = map
    map.addControl(new AttributionControl({ compact: true }), 'top-left')
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')

    map.on('load', () => {
      setMapReady(true)
      map.addSource(SOURCE_ID, { type: 'geojson', data: HEAT_ZONE_COLLECTION })
      // Keep place labels legible on top of the heat overlay.
      const firstLabelLayer = map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id

      map.addLayer(
        {
          id: FILL_LAYER,
          type: 'fill',
          source: SOURCE_ID,
          paint: {
            'fill-color': fillColorExpression,
            'fill-opacity': ['case', ['boolean', ['feature-state', 'hovered'], false], 0.8, 0.58],
            'fill-opacity-transition': { duration: 180, delay: 0 },
          },
        },
        firstLabelLayer,
      )

      map.addLayer(
        {
          id: LINE_LAYER,
          type: 'line',
          source: SOURCE_ID,
          paint: {
            'line-color': '#ffffff',
            'line-width': 1,
            'line-opacity': 0.6,
          },
        },
        firstLabelLayer,
      )

      map.addLayer(
        {
          id: SELECTED_LAYER,
          type: 'line',
          source: SOURCE_ID,
          filter: ['==', ['get', 'id'], ''],
          paint: { 'line-color': '#0f172a', 'line-width': 2.5 },
        },
        firstLabelLayer,
      )
    })

    let hoveredId: number | string | undefined

    const clearHover = () => {
      if (hoveredId !== undefined) {
        map.setFeatureState({ source: SOURCE_ID, id: hoveredId }, { hovered: false })
        hoveredId = undefined
      }
    }

    map.on('mousemove', FILL_LAYER, (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0]
      if (!feature || feature.id === undefined) return
      if (hoveredId !== feature.id) clearHover()
      hoveredId = feature.id
      map.setFeatureState({ source: SOURCE_ID, id: hoveredId }, { hovered: true })
      map.getCanvas().style.cursor = 'pointer'
    })

    map.on('mouseleave', FILL_LAYER, () => {
      clearHover()
      map.getCanvas().style.cursor = ''
    })

    map.on('click', FILL_LAYER, (event: MapLayerMouseEvent) => {
      const zoneId = event.features?.[0]?.properties?.id
      if (typeof zoneId === 'string') selectHandlerRef.current(zoneId)
    })

    map.on('click', (event: MapMouseEvent) => {
      if (!map.isStyleLoaded() || !map.getLayer(FILL_LAYER)) return
      const hits = map.queryRenderedFeatures(event.point, {
        layers: [FILL_LAYER],
      })
      if (hits.length === 0) selectHandlerRef.current(null)
    })

    return () => {
      if (simulatedZoneRef.current) {
        const previousFeatureId = zoneFeatureId(simulatedZoneRef.current)
        if (previousFeatureId !== null) {
          map.removeFeatureState({ source: SOURCE_ID, id: previousFeatureId }, 'simulatedIntensity')
        }
      }
      locationMarkerRef.current?.remove()
      locationMarkerRef.current = null
      setMapReady(false)
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const applyFilter = () => {
      if (!map.getLayer(SELECTED_LAYER)) return
      map.setFilter(SELECTED_LAYER, ['==', ['get', 'id'], selectedZoneId ?? ''])
    }

    if (map.isStyleLoaded()) applyFilter()
    else map.once('load', applyFilter)
  }, [selectedZoneId])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const applySimulation = () => {
      if (!map.getLayer(FILL_LAYER)) return

      const previousFeatureId = zoneFeatureId(simulatedZoneRef.current)
      const currentFeatureId = zoneFeatureId(selectedZoneId)

      // Only clear state we previously set: MapLibre throws during render when
      // a keyed removeFeatureState targets a feature that never had state.
      if (previousFeatureId !== null && (simulatedZoneRef.current !== selectedZoneId || simulatedScore === null)) {
        map.removeFeatureState({ source: SOURCE_ID, id: previousFeatureId }, 'simulatedIntensity')
        simulatedZoneRef.current = null
      }

      if (currentFeatureId !== null && simulatedScore !== null) {
        map.setFeatureState(
          { source: SOURCE_ID, id: currentFeatureId },
          { simulatedIntensity: Math.min(1, Math.max(0, simulatedScore / 100)) },
        )
        simulatedZoneRef.current = selectedZoneId
      }
    }

    if (map.isStyleLoaded()) applySimulation()
    else map.once('load', applySimulation)
  }, [selectedZoneId, simulatedScore])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !currentLocation || !mapReady) return

    const showLocation = () => {
      if (!map.isStyleLoaded()) return
      if (!locationMarkerRef.current) {
        const markerElement = document.createElement('div')
        markerElement.className = 'current-location-marker'
        markerElement.setAttribute('aria-label', 'Your current location')
        locationMarkerRef.current = new Marker({ element: markerElement })
          .setLngLat([currentLocation.longitude, currentLocation.latitude])
          .addTo(map)
      } else {
        locationMarkerRef.current.setLngLat([currentLocation.longitude, currentLocation.latitude])
      }
      map.flyTo({
        center: [currentLocation.longitude, currentLocation.latitude],
        essential: true,
        duration: 700,
      })
    }

    if (map.isStyleLoaded()) showLocation()
    else map.once('load', showLocation)

    return () => {
      map.off('load', showLocation)
    }
  }, [currentLocation, mapReady])

  return <div ref={containerRef} className="h-full w-full" />
})
