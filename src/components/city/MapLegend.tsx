import { HEAT_BANDS } from '../../data/heatZones'

export function MapLegend() {
  return (
    <div className="pointer-events-auto rounded-2xl bg-white/70 px-4 py-3 shadow-lg shadow-slate-900/10 ring-1 ring-white/60 backdrop-blur-xl">
      <p className="text-[11px] font-semibold tracking-[0.18em] text-slate-400 uppercase">
        Estimated heat exposure
      </p>
      <div className="mt-2 flex items-center gap-3">
        <div className="flex overflow-hidden rounded-full">
          {HEAT_BANDS.map((band) => (
            <span key={band.id} className="h-2 w-8" style={{ backgroundColor: band.color }} />
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-slate-500">
        <span>Cooler</span>
        <span>Hotter</span>
      </div>
    </div>
  )
}
