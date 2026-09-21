import { ArrowUp, CornerUpLeft, CornerUpRight, MapPinCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Panel } from '../components/Panel'
import { PageHeading } from '../components/PageHeading'
import { RouteMap } from '../components/routes/RouteMap'
import { ROUTE_NODES } from '../data/routeNetwork'
import { planRoutes, type PlannedRoute } from '../lib/routePlanning'

export function RoutesPage() {
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [selectedRoute, setSelectedRoute] = useState<'fastest' | 'coolGrid'>('fastest')
  const from = useMemo(() => ROUTE_NODES.find((node) => node.id === fromId) ?? null, [fromId])
  const to = useMemo(() => ROUTE_NODES.find((node) => node.id === toId) ?? null, [toId])
  const comparison = useMemo(() => (from && to ? planRoutes(from.id, to.id) : null), [from, to])
  const activeRoute = comparison?.[selectedRoute === 'fastest' ? 'fastest' : 'heatWise'] ?? null

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="CoolGrid Routes" description="Pick a start and destination, then compare the fastest path against a cooler alternative." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Panel title="Trip planner" subtitle="Start and destination">
          <div className="space-y-4">
            <RouteSelect label="From" value={fromId} onChange={setFromId} excludeId={toId} />
            <RouteSelect label="To" value={toId} onChange={setToId} excludeId={fromId} />
            <p className="rounded-2xl bg-slate-900/[0.03] px-4 py-3 text-xs leading-relaxed text-slate-500">Simulated walking network. Route geometry and heat exposure are estimated for this prototype, not live navigation.</p>
          </div>
        </Panel>
        <Panel title="Route comparison" subtitle="Travel time vs. estimated heat exposure">
          <div className="h-[28rem] overflow-hidden rounded-2xl bg-slate-900/[0.03]"><RouteMap comparison={comparison} from={from} to={to} /></div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <RouteCard title="Fastest Route" route={comparison?.fastest ?? null} accent="text-rose-500" hint="Shortest walking time." />
            <RouteCard title="CoolGrid Route" route={comparison?.heatWise ?? null} accent="text-teal-500" hint="Balances walking time with lower estimated heat exposure." />
          </div>
          {comparison ? <p className="mt-4 text-sm font-medium text-teal-600">{comparison.exposureReduction !== null ? `↓ ${comparison.exposureReduction}% estimated exposure` : 'No meaningful heat reduction found.'}</p> : <p className="mt-4 text-sm text-slate-400">Select a starting point and destination to compare routes.</p>}
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
          {steps.map(({ icon: Icon, label, distance }) => (
            <li key={`${label}-${distance}`} className="flex items-center gap-3 text-sm text-slate-600">
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

function buildWalkingSteps(route: PlannedRoute, fromLabel: string, toLabel: string) {
  const segmentSteps = route.coordinates.slice(0, -1).map((coordinate, index) => {
    const nextCoordinate = route.coordinates[index + 1]
    const previousCoordinate = route.coordinates[index - 1]
    const distance = Math.max(1, Math.round(distanceBetween(coordinate, nextCoordinate)))
    const direction = previousCoordinate
      ? turnDirection(previousCoordinate, coordinate, nextCoordinate)
      : 'straight'

    return {
      icon: direction === 'left' ? CornerUpLeft : direction === 'right' ? CornerUpRight : ArrowUp,
      label: index === 0 ? `Start at ${fromLabel}` : direction === 'straight' ? 'Continue straight' : `Turn ${direction}`,
      distance: index === 0 ? null : `${distance} m`,
    }
  })

  return [
    ...segmentSteps,
    { icon: MapPinCheck, label: `Arrive at ${toLabel}`, distance: null },
  ]
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

function RouteCard({ title, route, accent, hint }: { title: string; route: PlannedRoute | null; accent: string; hint: string }) {
  return <div className="rounded-2xl bg-slate-900/[0.03] p-4"><p className={`text-sm font-semibold ${accent}`}>{title}</p><dl className="mt-3 space-y-2 text-sm"><Metric label="Walking time" value={route ? `${route.walkingMinutes} min` : '—'} /><Metric label="Distance" value={route ? `${(route.distanceMeters / 1000).toFixed(1)} km` : '—'} /><Metric label="Estimated heat exposure" value={route ? `${route.exposure}/100` : '—'} /></dl><p className="mt-3 text-xs text-slate-400">{hint}</p></div>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3 text-slate-500"><dt>{label}</dt><dd className="text-right text-slate-700">{value}</dd></div>
}