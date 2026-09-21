import { useCallback, useEffect, useMemo, useState } from 'react'
import { MapLegend } from '../components/city/MapLegend'
import { TelemetryBar } from '../components/city/TelemetryBar'
import { ZoneInspector } from '../components/city/ZoneInspector'
import { HeatZoneMap } from '../components/map/HeatZoneMap'
import { DEMO_AREA, findNearestHeatZone, HEAT_ZONES } from '../data/heatZones'

type ResidentLocationStatus = 'requesting' | 'available' | 'unavailable'
type MapLocation = { latitude: number; longitude: number }
const RESIDENT_SELECTED_ZONE_KEY = 'coolgrid-resident-selected-zone'

function getStoredResidentZoneId() {
  try {
    return sessionStorage.getItem(RESIDENT_SELECTED_ZONE_KEY)
  } catch {
    return null
  }
}

function storeResidentZoneId(zoneId: string | null) {
  try {
    if (zoneId) sessionStorage.setItem(RESIDENT_SELECTED_ZONE_KEY, zoneId)
    else sessionStorage.removeItem(RESIDENT_SELECTED_ZONE_KEY)
  } catch {
    // Session storage is optional; resident selection still works in memory.
  }
}

export function CityIntelligencePage({ planner = true }: { planner?: boolean }) {
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(() =>
    planner ? null : getStoredResidentZoneId(),
  )
  const [simulatedScore, setSimulatedScore] = useState<number | null>(null)
  const [residentLocation, setResidentLocation] = useState<MapLocation | null>(null)
  const [residentLocationStatus, setResidentLocationStatus] = useState<ResidentLocationStatus>(() =>
    planner || !('geolocation' in navigator) ? 'unavailable' : 'requesting',
  )
  const selectedZone = useMemo(
    () => HEAT_ZONES.find((zone) => zone.id === selectedZoneId) ?? null,
    [selectedZoneId],
  )

  useEffect(() => {
    if (planner) return
    if (!navigator.geolocation) {
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nearestZone = findNearestHeatZone(position.coords.latitude, position.coords.longitude)
        setSelectedZoneId(nearestZone.id)
        storeResidentZoneId(nearestZone.id)
        setResidentLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
        setResidentLocationStatus('available')
      },
      () => {
        setResidentLocationStatus('unavailable')
      },
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 8_000 },
    )
  }, [planner])

  const handleSelectZone = useCallback((zoneId: string | null) => {
    setSelectedZoneId(zoneId)
    if (!planner) storeResidentZoneId(zoneId)
    setSimulatedScore(null)
    if (!planner && zoneId) setResidentLocationStatus('available')
  }, [planner])

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            {planner ? 'Abu Dhabi Urban Planning' : 'Heat around you'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {planner
              ? `Simulated heat-exposure zones across ${DEMO_AREA.city}. Tap any zone to inspect its environmental factors.`
              : 'Explore simulated heat exposure around Abu Dhabi and understand the conditions that shape a cooler walk.'}
          </p>
        </div>
      </div>

      <div className={`relative min-h-0 overflow-hidden rounded-[28px] shadow-2xl shadow-slate-900/15 ring-1 ring-white/70 ${planner ? 'h-[calc(100dvh-8rem)] min-h-[520px]' : 'h-[calc(100vh-13rem)] min-h-[440px]'}`}>
        <HeatZoneMap
          selectedZoneId={selectedZoneId}
          simulatedScore={simulatedScore}
          onSelectZone={handleSelectZone}
          currentLocation={planner ? null : residentLocation}
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-4">
          <TelemetryBar zones={HEAT_ZONES} />
        </div>

        <div className={`pointer-events-none absolute inset-x-0 bottom-0 flex min-h-0 max-w-full flex-col gap-3 p-4 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-auto sm:max-w-full sm:items-end sm:justify-between sm:pt-24 ${planner ? 'sm:pb-4' : 'sm:pb-16'}`}>
          <div className="order-2 min-h-0 max-w-full sm:order-1">
            <ZoneInspector
              zone={selectedZone}
              onClose={() => handleSelectZone(null)}
              onSimulatedScoreChange={setSimulatedScore}
              planner={planner}
              residentLocationStatus={planner ? undefined : residentLocationStatus}
            />
          </div>
          <div className="order-1 self-start sm:order-2 sm:self-end">
            <MapLegend />
          </div>
        </div>
      </div>
    </div>
  )
}
