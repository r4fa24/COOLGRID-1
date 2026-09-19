import { useMemo, useState } from 'react'
import { Panel } from '../components/Panel'
import { PageHeading } from '../components/PageHeading'
import { RouteMap } from '../components/routes/RouteMap'
import { ROUTE_NODES } from '../data/routeNetwork'
import { planRoutes, type PlannedRoute } from '../lib/routePlanning'

export function RoutesPage() {
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const from = useMemo(() => ROUTE_NODES.find((node) => node.id === fromId) ?? null, [fromId])
  const to = useMemo(() => ROUTE_NODES.find((node) => node.id === toId) ?? null, [toId])
  const comparison = useMemo(() => (from && to ? planRoutes(from.id, to.id) : null), [from, to])

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="HeatWise Routes" description="Pick a start and destination, then compare the fastest path against a cooler alternative." />
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
            <RouteCard title="HeatWise Route" route={comparison?.heatWise ?? null} accent="text-teal-500" hint="Balances walking time with lower estimated heat exposure." />
          </div>
          {comparison ? <p className="mt-4 text-sm font-medium text-teal-600">{comparison.exposureReduction !== null ? `↓ ${comparison.exposureReduction}% estimated exposure` : 'No meaningful heat reduction found.'}</p> : <p className="mt-4 text-sm text-slate-400">Select a starting point and destination to compare routes.</p>}
        </Panel>
      </div>
    </div>
  )
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