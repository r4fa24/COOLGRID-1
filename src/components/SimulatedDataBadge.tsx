import { FlaskConical } from 'lucide-react'
import { DATA_SOURCE_LABEL } from '../data/appConfig'

export function SimulatedDataBadge() {
  return (
    <span
      title="All values in this prototype are generated locally — no municipal sensors, no live APIs."
      className="inline-flex items-center gap-2 rounded-full bg-amber-400/20 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-amber-700 uppercase ring-1 ring-amber-400/50 backdrop-blur"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-70" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
      </span>
      <FlaskConical className="h-3.5 w-3.5" />
      {DATA_SOURCE_LABEL}
    </span>
  )
}
