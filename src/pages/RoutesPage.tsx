import { ArrowUp, CornerUpLeft, CornerUpRight, MapPinCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Panel } from '../components/Panel'
import { PageHeading } from '../components/PageHeading'
import { RouteMap } from '../components/routes/RouteMap'
import { ROUTE_NODES } from '../data/routeNetwork'
import { exposureCategoryFor } from '../lib/heatExposure'
import { planRoutes, type PlannedRoute } from '../lib/routePlanning'

const TRAVEL_TIMES = [
  { value: 8, label: '8:00 AM', exposureMultiplier: 0.68, uvIndex: 3, uvLabel: 'Moderate' },
  { value: 10, label: '10:00 AM', exposureMultiplier: 0.86, uvIndex: 5, uvLabel: 'Moderate' },
  { value: 12, label: '12:00 PM', exposureMultiplier: 1.08, uvIndex: 8, uvLabel: 'Very High' },
  { value: 14, label: '2:00 PM', exposureMultiplier: 1.18, uvIndex: 9, uvLabel: 'Very High' },
  { value: 16, label: '4:00 PM', exposureMultiplier: 1.12, uvIndex: 8, uvLabel: 'Very High' },
  { value: 18, label: '6:00 PM', exposureMultiplier: 0.78, uvIndex: 5, uvLabel: 'Moderate' },
] as const
type TravelTime = (typeof TRAVEL_TIMES)[number]
type CurrentLocation = { latitude: number; longitude: number }

export function RoutesPage() {
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [currentLocation, setCurrentLocation] = useState<CurrentLocation | null>(null)
  const [locationStatus, setLocationStatus] = useState<'requesting' | 'available' | 'unavailable'>(() =>
    'geolocation' in navigator ? 'requesting' : 'unavailable',
  )
  const [selectedRoute, setSelectedRoute] = useState<'fastest' | 'coolGrid'>('fastest')
  const [startRequest, setStartRequest] = useState(0)
  const [generatedRoute, setGeneratedRoute] = useState<PlannedRoute | null>(null)
  const [travelTime, setTravelTime] = useState(8)
  useEffect(() => {
    if (!navigator.geolocation) {
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nearestNode = ROUTE_NODES.reduce((closest, node) =>
          routeNodeDistance(position.coords.latitude, position.coords.longitude, node.coordinate) <
          routeNodeDistance(position.coords.latitude, position.coords.longitude, closest.coordinate)
            ? node
            : closest,
        )
        setFromId(nearestNode.id)
        setGeneratedRoute(null)
        setCurrentLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
        setLocationStatus('available')
      },
      () => setLocationStatus('unavailable'),
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 8_000 },
    )
  }, [])
  const from = useMemo(() => ROUTE_NODES.find((node) => node.id === fromId) ?? null, [fromId])
  const to = useMemo(() => ROUTE_NODES.find((node) => node.id === toId) ?? null, [toId])
  const comparison = useMemo(() => (from && to ? planRoutes(from.id, to.id) : null), [from, to])
  const timeProfile = TRAVEL_TIMES.find((time) => time.value === travelTime) ?? TRAVEL_TIMES[0]
  const timedRoutes = useMemo(
    () =>
      comparison
        ? {
            fastest: withTimedExposure(comparison.fastest, timeProfile.exposureMultiplier),
            heatWise: withTimedExposure(generatedRoute ?? comparison.heatWise, timeProfile.exposureMultiplier),
          }
        : null,
    [comparison, generatedRoute, timeProfile],
  )
  const timedExposureReduction =
    timedRoutes && timedRoutes.fastest.exposure > 0 && timedRoutes.heatWise.exposure < timedRoutes.fastest.exposure
      ? Math.round(((timedRoutes.fastest.exposure - timedRoutes.heatWise.exposure) / timedRoutes.fastest.exposure) * 100)
      : null
  const activeRoute = timedRoutes?.[selectedRoute === 'fastest' ? 'fastest' : 'heatWise'] ?? null
  const activeExposureCategory = activeRoute ? exposureCategoryFor(activeRoute.exposure) : null
  const showExposureWarning =
    activeExposureCategory?.id === 'high' || activeExposureCategory?.id === 'very-high'
  const recommendedTime: { time: TravelTime; exposure: number } | null = timedRoutes
    ? TRAVEL_TIMES.reduce<{ time: TravelTime; exposure: number }>((recommended, time) => {
        const exposure = withTimedExposure(
          selectedRoute === 'fastest' ? comparison!.fastest : comparison!.heatWise,
          time.exposureMultiplier,
        ).exposure
        return exposure < recommended.exposure ? { time, exposure } : recommended
      }, { time: TRAVEL_TIMES[0], exposure: Number.POSITIVE_INFINITY })
    : null
  const selectRoute = (route: 'fastest' | 'coolGrid') => {
    setSelectedRoute(route)
    setStartRequest(0)
    setGeneratedRoute(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="CoolGrid Routes" description="Pick a start and destination, then compare the fastest path against a cooler alternative." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Panel title="Trip planner" subtitle="Start and destination">
          <div className="space-y-4">
            {locationStatus === 'unavailable' ? (
              <RouteSelect label="From (manual fallback)" value={fromId} onChange={(value) => { setFromId(value); setGeneratedRoute(null) }} excludeId={toId} />
            ) : (
              <div className="rounded-2xl bg-slate-900/[0.03] px-3.5 py-3 text-sm text-slate-700">
                <span className="font-medium text-slate-500">From:</span> Current location
                {locationStatus === 'requesting' && <span className="ml-2 text-xs text-slate-400">Locating…</span>}
              </div>
            )}
            <RouteSelect label="To" value={toId} onChange={(value) => { setToId(value); setGeneratedRoute(null) }} excludeId={fromId} />
            <p className="rounded-2xl bg-slate-900/[0.03] px-4 py-3 text-xs leading-relaxed text-slate-500">Simulated walking network. Route geometry and heat exposure are estimated for this prototype, not live navigation. While a trip is running, the route ahead is re-planned every few seconds on the same estimated data and a cooler alternative is offered when one appears.</p>
          </div>
        </Panel>
        <Panel title="Route comparison" subtitle="Travel time vs. estimated heat exposure">
          <div className="h-[28rem] overflow-hidden rounded-2xl bg-slate-900/[0.03]"><RouteMap comparison={comparison} from={from} to={to} selectedRoute={selectedRoute} currentLocation={currentLocation} startRequest={startRequest} onReroute={setSelectedRoute} generatedRoute={generatedRoute} onGeneratedRoute={setGeneratedRoute} /></div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-900/[0.03] px-4 py-3">
            <label htmlFor="travel-time" className="text-sm font-semibold text-slate-700">Travel time</label>
            <select
              id="travel-time"
              value={travelTime}
              onChange={(event) => setTravelTime(Number(event.target.value))}
              className="rounded-xl border-0 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-900/10 focus:ring-2 focus:ring-teal-500"
            >
              {TRAVEL_TIMES.map((time) => <option key={time.value} value={time.value}>{time.label}</option>)}
            </select>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <RouteCard title="Fastest Route" route={timedRoutes?.fastest ?? null} accent="text-rose-500" hint="Shortest walking time." selected={selectedRoute === 'fastest'} onSelect={() => selectRoute('fastest')} />
            <RouteCard title={generatedRoute ? 'CoolGrid Route · remaining trip' : 'CoolGrid Route'} route={timedRoutes?.heatWise ?? null} accent="text-teal-500" hint={generatedRoute ? 'Rerouted mid-trip: these figures cover the walk still ahead, so they are not comparable to the full fastest route.' : 'Balances walking time with lower estimated heat exposure.'} selected={selectedRoute === 'coolGrid'} onSelect={() => selectRoute('coolGrid')} />
          </div>
          <button
            type="button"
            onClick={() => setStartRequest((request) => request + 1)}
            disabled={!activeRoute}
            className="mt-4 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Start
          </button>
          {comparison ? <p className="mt-4 text-sm font-medium text-teal-600">{generatedRoute ? 'Rerouted mid-trip — the CoolGrid card now covers the remaining walk only.' : timedExposureReduction !== null ? `↓ ${timedExposureReduction}% estimated exposure at ${timeProfile.label}` : 'No meaningful heat reduction found at this time.'}</p> : <p className="mt-4 text-sm text-slate-400">Select a starting point and destination to compare routes.</p>}
          {showExposureWarning && (
            <div className="mt-4 rounded-2xl border border-amber-300/60 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
              <p className="font-semibold">⚠️ High heat exposure along this route at {timeProfile.label}</p>
              <p className="mt-1 text-xs text-amber-900/75">UV Index: {timeProfile.uvIndex} — {timeProfile.uvLabel}</p>
              <p className="mt-1 text-xs text-amber-900/75">Higher heat and sun exposure expected along this route.</p>
            </div>
          )}
          {recommendedTime && (
            <p className="mt-4 rounded-2xl bg-teal-50/70 px-4 py-3 text-xs leading-relaxed text-teal-900">
              <span className="font-semibold">Recommended time</span>
              <span className="mx-1.5">·</span>
              Consider travelling around <span className="font-semibold">{recommendedTime.time.label}</span> for lower exposure.
            </p>
          )}
          <WalkingDirections
            route={activeRoute}
            fromLabel={from?.label ?? null}
            toLabel={to?.label ?? null}
            selectedRoute={selectedRoute}
            onSelectRoute={setSelectedRoute}
          />
        </Panel>
      </div>
    </div>
  )
}

function withTimedExposure(route: PlannedRoute, exposureMultiplier: number): PlannedRoute {
  return { ...route, exposure: Math.min(100, Math.round(route.exposure * exposureMultiplier)) }
}

function WalkingDirections({
  route,
  fromLabel,
  toLabel,
  selectedRoute,
  onSelectRoute,
}: {
  route: PlannedRoute | null
  fromLabel: string | null
  toLabel: string | null
  selectedRoute: 'fastest' | 'coolGrid'
  onSelectRoute: (route: 'fastest' | 'coolGrid') => void
}) {
  const steps = route && fromLabel && toLabel ? buildWalkingSteps(route, fromLabel, toLabel) : []

  return (
    <section className="mt-5 border-t border-slate-900/10 pt-5" aria-labelledby="walking-directions-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="walking-directions-heading" className="text-sm font-semibold tracking-[0.12em] text-slate-700 uppercase">
            Walking directions
          </h3>
          <p className="mt-1 text-xs text-slate-400">Select a route to view its walking steps.</p>
        </div>
        <div className="flex rounded-full bg-slate-900/[0.04] p-1" role="group" aria-label="Route for walking directions">
          <RouteChoice active={selectedRoute === 'fastest'} onClick={() => onSelectRoute('fastest')}>
            Fastest
          </RouteChoice>
          <RouteChoice active={selectedRoute === 'coolGrid'} onClick={() => onSelectRoute('coolGrid')}>
            CoolGrid Route
          </RouteChoice>
        </div>
      </div>

      {steps.length > 0 ? (
        <ol className="mt-4 space-y-3">
          {steps.map(({ icon: Icon, label, distance }, index) => (
            <li key={`${index}-${label}`} className="flex items-center gap-3 text-sm text-slate-600">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-400/15 text-teal-700">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">{label}</span>
              {distance && <span className="shrink-0 text-xs font-medium text-slate-400">{distance}</span>}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 rounded-2xl bg-slate-900/[0.03] px-4 py-3 text-sm text-slate-400">
          Select a starting point and destination to view walking directions.
        </p>
      )}
    </section>
  )
}

function RouteChoice({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
        active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  )
}

/** Turns shorter than this are treated as the street bending, not an
 *  instruction, so a route of hundreds of OSM vertices reads as a few steps. */
const MIN_STEP_METERS = 60

function buildWalkingSteps(route: PlannedRoute, fromLabel: string, toLabel: string) {
  const steps: { icon: typeof ArrowUp; label: string; distance: string | null }[] = [
    { icon: ArrowUp, label: `Start at ${fromLabel}`, distance: null },
  ]
  let walked = 0

  for (let index = 1; index < route.coordinates.length; index += 1) {
    walked += distanceBetween(route.coordinates[index - 1], route.coordinates[index])
    const nextCoordinate = route.coordinates[index + 1]
    if (!nextCoordinate || walked < MIN_STEP_METERS) continue
    const direction = turnDirection(route.coordinates[index - 1], route.coordinates[index], nextCoordinate)
    if (direction === 'straight') continue
    steps.push({
      icon: direction === 'left' ? CornerUpLeft : CornerUpRight,
      label: `Turn ${direction}`,
      distance: `${Math.round(walked)} m`,
    })
    walked = 0
  }

  if (walked >= 1) {
    steps.push({ icon: ArrowUp, label: 'Continue straight', distance: `${Math.round(walked)} m` })
  }
  steps.push({ icon: MapPinCheck, label: `Arrive at ${toLabel}`, distance: null })
  return steps
}

function turnDirection(
  previous: [number, number],
  current: [number, number],
  next: [number, number],
) {
  const incoming = bearing(previous, current)
  const outgoing = bearing(current, next)
  const turn = ((outgoing - incoming + 540) % 360) - 180
  if (turn < -18) return 'left'
  if (turn > 18) return 'right'
  return 'straight'
}

function bearing(from: [number, number], to: [number, number]) {
  const longitude = ((to[0] - from[0]) * Math.PI) / 180
  const fromLatitude = (from[1] * Math.PI) / 180
  const toLatitude = (to[1] * Math.PI) / 180
  return (Math.atan2(
    Math.sin(longitude) * Math.cos(toLatitude),
    Math.cos(fromLatitude) * Math.sin(toLatitude) -
      Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(longitude),
  ) * 180) / Math.PI
}

function distanceBetween(from: [number, number], to: [number, number]) {
  const earthRadius = 6_371_000
  const latitude = ((to[1] - from[1]) * Math.PI) / 180
  const longitude = ((to[0] - from[0]) * Math.PI) / 180
  const fromLatitude = (from[1] * Math.PI) / 180
  const toLatitude = (to[1] * Math.PI) / 180
  const a =
    Math.sin(latitude / 2) ** 2 +
    Math.sin(longitude / 2) ** 2 * Math.cos(fromLatitude) * Math.cos(toLatitude)
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function RouteSelect({ label, value, onChange, excludeId }: { label: string; value: string; onChange: (value: string) => void; excludeId: string }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-2xl bg-white/70 px-3.5 py-3 text-sm font-normal text-slate-700 outline-none ring-1 ring-slate-900/10 transition focus:ring-teal-400"><option value="">Select a location</option>{ROUTE_NODES.filter((node) => node.id !== excludeId).map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}</select></label>
}

function RouteCard({ title, route, accent, hint, selected, onSelect }: { route: PlannedRoute | null; title: string; accent: string; hint: string; selected: boolean; onSelect: () => void }) {
  return <button type="button" onClick={onSelect} aria-pressed={selected} className={`w-full rounded-2xl p-4 text-left transition ${selected ? 'bg-white shadow-md ring-2 ring-slate-900/10' : 'bg-slate-900/[0.03] opacity-70 hover:opacity-100'}`}><p className={`text-sm font-semibold ${accent}`}>{selected ? `${title} · Selected` : title}</p><dl className="mt-3 space-y-2 text-sm"><Metric label="Walking time" value={route ? `${route.walkingMinutes} min` : '—'} /><Metric label="Distance" value={route ? `${(route.distanceMeters / 1000).toFixed(1)} km` : '—'} /><Metric label="Estimated heat exposure" value={route ? `${route.exposure}/100` : '—'} /></dl><p className="mt-3 text-xs text-slate-400">{hint}</p></button>
}

function routeNodeDistance(latitude: number, longitude: number, coordinate: [number, number]) {
  const latitudeDistance = latitude - coordinate[1]
  const longitudeDistance = (longitude - coordinate[0]) * Math.cos((latitude * Math.PI) / 180)
  return latitudeDistance ** 2 + longitudeDistance ** 2
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3 text-slate-500"><dt>{label}</dt><dd className="text-right text-slate-700">{value}</dd></div>
}