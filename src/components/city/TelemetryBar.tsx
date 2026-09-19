import { Flame, MapPin, Thermometer, Layers } from 'lucide-react'
import { DEMO_AREA, summarizeZones, type HeatZone } from '../../data/heatZones'

export function TelemetryBar({ zones }: { zones: HeatZone[] }) {
  const { zoneCount, avgTemperature, highExposure } = summarizeZones(zones)

  const items = [
    { icon: Layers, label: 'Zones simulated', value: String(zoneCount) },
    {
      icon: Thermometer,
      label: 'Avg. temperature',
      value: `${avgTemperature}°C`,
    },
    { icon: Flame, label: 'High exposure', value: String(highExposure) },
    { icon: MapPin, label: 'Focus', value: DEMO_AREA.city },
  ]

  return (
    <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-full bg-white/70 px-4 py-2 shadow-lg shadow-slate-900/10 ring-1 ring-white/60 backdrop-blur-xl sm:gap-x-6 sm:px-5 sm:py-3">
      {items.map(({ icon: Icon, label, value }) => (
        <div key={label} className="flex items-center gap-2 sm:gap-2.5">
          <Icon className="h-4 w-4 text-amber-500" />
          <div className="leading-tight">
            <p className="hidden text-[10px] font-semibold tracking-[0.14em] text-slate-400 uppercase sm:block">
              {label}
            </p>
            <p className="text-sm font-semibold text-slate-800">{value}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
