import { X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import {
  calculateHeatExposure,
  explainHeatExposure,
  percentageFactorLabel,
} from '../../lib/heatExposure'
import { getZoneIntelligence } from '../../lib/zoneIntelligence'
import type { HeatZone } from '../../data/heatZones'

type ZoneInspectorProps = {
  zone: HeatZone | null
  onClose: () => void
  onSimulatedScoreChange: (score: number | null) => void
  planner?: boolean
}

export function ZoneInspector({ zone, onClose, onSimulatedScoreChange, planner = true }: ZoneInspectorProps) {
  if (!zone) {
    return (
      <div className="pointer-events-auto w-full max-w-[calc(100vw-2rem)] rounded-3xl bg-white/70 px-5 py-4 text-sm text-slate-500 shadow-xl shadow-slate-900/10 ring-1 ring-white/60 backdrop-blur-xl sm:w-96">
        Select a heat zone to inspect
      </div>
    )
  }

  return (
    <ZoneInspectorContent
      key={zone.id}
      zone={zone}
      onClose={onClose}
      onSimulatedScoreChange={onSimulatedScoreChange}
      planner={planner}
    />
  )
}

function ZoneInspectorContent({
  zone,
  onClose,
  onSimulatedScoreChange,
  planner,
}: {
  zone: HeatZone
  onClose: () => void
  onSimulatedScoreChange: (score: number | null) => void
  planner: boolean
}) {
  const [simulatedShade, setSimulatedShade] = useState(zone.factors.shadePct)
  const [simulatedVegetation, setSimulatedVegetation] = useState(zone.factors.vegetationPct)

  const { factors, heatExposure } = zone
  const { score, category } = heatExposure
  const explanation = explainHeatExposure(heatExposure)
  const intelligence = getZoneIntelligence(zone)
  const simulatedHeatExposure = calculateHeatExposure({
    ...factors,
    shadePct: simulatedShade,
    vegetationPct: simulatedVegetation,
  })
  const scoreDifference = simulatedHeatExposure.score - score
  const exposureReduction = score > 0 ? Math.round(((score - simulatedHeatExposure.score) / score) * 100) : 0

  return (
    <div className="zone-inspector pointer-events-auto flex w-full min-h-0 max-w-[calc(100vw-2rem)] flex-col overflow-y-auto rounded-3xl bg-white/75 p-6 shadow-2xl shadow-slate-900/15 ring-1 ring-white/60 backdrop-blur-xl sm:w-96">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-slate-400 uppercase">
            {zone.district}
          </p>
          <h2 className="text-2xl font-semibold text-slate-900">{zone.name}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close zone inspector"
          className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-900/5 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-5 flex items-end gap-3">
        <span className="text-5xl leading-none font-light text-slate-900">
          {score}
          <span className="align-top text-2xl text-slate-400">/100</span>
        </span>
        <span
          className="mb-1 rounded-full px-3 py-1 text-xs font-semibold text-white"
          style={{ backgroundColor: category.color }}
        >
          {category.label}
        </span>
      </div>

      <p className="mt-2 text-xs text-slate-400">Heat Exposure Score — Simulated Estimate</p>

      <p className="mt-3 rounded-2xl bg-slate-900/[0.03] px-3.5 py-3 text-sm leading-relaxed text-slate-600">
        {explanation}
      </p>

      <dl className="mt-5 space-y-3 text-sm">
        <Factor
          label="Temperature"
          value={`${factors.temperatureC}°C`}
          fill={heatExposure.normalized.temperature * 100}
        />
        <Factor label="Humidity" value={`${factors.humidityPct}%`} fill={factors.humidityPct} />
        <Factor
          label="Solar exposure"
          value={percentageFactorLabel(factors.solarExposurePct)}
          fill={factors.solarExposurePct}
        />
        <Factor label="Shade" value={`${factors.shadePct}%`} fill={factors.shadePct} cool />
        <Factor
          label="Vegetation"
          value={`${factors.vegetationPct}%`}
          fill={factors.vegetationPct}
          cool
        />
        <Factor
          label="Pedestrian density"
          value={percentageFactorLabel(factors.pedestrianDensityPct)}
          fill={factors.pedestrianDensityPct}
        />
      </dl>

      {planner && <section className="mt-6 border-t border-slate-900/10 pt-5" aria-labelledby="human-exposure-heading">
        <h3 id="human-exposure-heading" className="text-sm font-semibold text-slate-900">
          Human exposure
        </h3>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-2xl font-semibold text-slate-900">
              {percentageFactorLabel(factors.pedestrianDensityPct)}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              ~{estimatePedestriansPerDay(factors.pedestrianDensityPct).toLocaleString()} pedestrians/day
            </p>
          </div>
          <p className="text-right text-[10px] font-semibold tracking-[0.12em] text-slate-400 uppercase">
            Simulated estimate
          </p>
        </div>
      </section>}

      {planner && <section className="mt-6 border-t border-slate-900/10 pt-5" aria-labelledby="zone-attention-heading">
        <h3 id="zone-attention-heading" className="text-sm font-semibold text-slate-900">
          Why this zone needs attention
        </h3>

        <div className="mt-4 space-y-4 text-sm">
          <IntelligenceGroup title="Key Heat Drivers">
            <ul className="list-disc space-y-1 pl-5 text-slate-600">
              {intelligence.keyHeatDrivers.map((driver) => (
                <li key={driver}>{driver}</li>
              ))}
            </ul>
          </IntelligenceGroup>

          <IntelligenceGroup title="Cooling Conditions">
            <p className="leading-relaxed text-slate-600">{intelligence.coolingConditions}</p>
          </IntelligenceGroup>

          <IntelligenceGroup title="Recommended Interventions">
            <ul className="list-disc space-y-1 pl-5 text-slate-600">
              {intelligence.recommendedInterventions.map((intervention) => (
                <li key={intervention}>{intervention}</li>
              ))}
            </ul>
          </IntelligenceGroup>
        </div>
      </section>}

      {planner && <WhatIfSimulator
        currentShade={factors.shadePct}
        simulatedShade={simulatedShade}
        currentVegetation={factors.vegetationPct}
        simulatedVegetation={simulatedVegetation}
        currentScore={score}
        simulatedScore={simulatedHeatExposure.score}
        scoreDifference={scoreDifference}
        exposureReduction={exposureReduction}
        onShadeChange={(value) => {
          setSimulatedShade(value)
          onSimulatedScoreChange(
            calculateHeatExposure({
              ...factors,
              shadePct: value,
              vegetationPct: simulatedVegetation,
            }).score,
          )
        }}
        onVegetationChange={(value) => {
          setSimulatedVegetation(value)
          onSimulatedScoreChange(
            calculateHeatExposure({
              ...factors,
              shadePct: simulatedShade,
              vegetationPct: value,
            }).score,
          )
        }}
        onReset={() => {
          setSimulatedShade(factors.shadePct)
          setSimulatedVegetation(factors.vegetationPct)
          onSimulatedScoreChange(null)
        }}
      />}
    </div>
  )
}

function WhatIfSimulator({
  currentShade,
  simulatedShade,
  currentVegetation,
  simulatedVegetation,
  currentScore,
  simulatedScore,
  scoreDifference,
  exposureReduction,
  onShadeChange,
  onVegetationChange,
  onReset,
}: {
  currentShade: number
  simulatedShade: number
  currentVegetation: number
  simulatedVegetation: number
  currentScore: number
  simulatedScore: number
  scoreDifference: number
  exposureReduction: number
  onShadeChange: (value: number) => void
  onVegetationChange: (value: number) => void
  onReset: () => void
}) {
  const formattedDifference = scoreDifference > 0 ? `+${scoreDifference}` : String(scoreDifference)
  const impactLabel = scoreDifference < 0 ? 'Estimated exposure reduction' : scoreDifference > 0 ? 'Estimated exposure increase' : 'Estimated exposure change'

  return (
    <section className="mt-6 border-t border-slate-900/10 pt-5" aria-labelledby="what-if-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="what-if-heading" className="text-sm font-semibold text-slate-900">
            What If?
          </h3>
          <p className="mt-1 text-xs text-slate-500">Simulate the impact of cooling interventions</p>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="what-if-vegetation" className="font-medium text-slate-700">
              Vegetation
            </label>
            <span className="text-slate-600">
              {currentVegetation}% <span className="text-slate-400">→</span> {simulatedVegetation}%
            </span>
          </div>
          <input
            id="what-if-vegetation"
            type="range"
            min="0"
            max="100"
            step="1"
            value={simulatedVegetation}
            onChange={(event) => {
              const value = Number(event.target.value)
              onVegetationChange(value)
            }}
            className="mt-2 h-2 w-full cursor-pointer accent-teal-500"
            aria-label="Simulated vegetation percentage"
          />
        </div>
        <span className="rounded-full bg-slate-900/[0.04] px-2 py-1 text-[10px] font-semibold tracking-[0.12em] text-slate-400 uppercase">
          Simulated Estimate
        </span>
      </div>

      <div className="mt-4 space-y-4 text-sm">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="what-if-shade" className="font-medium text-slate-700">
              Shade
            </label>
            <span className="text-slate-600">
              {currentShade}% <span className="text-slate-400">→</span> {simulatedShade}%
            </span>
          </div>
          <input
            id="what-if-shade"
            type="range"
            min="0"
            max="100"
            step="1"
            value={simulatedShade}
            onChange={(event) => {
              const value = Number(event.target.value)
              onShadeChange(value)
            }}
            className="mt-2 h-2 w-full cursor-pointer accent-teal-500"
            aria-label="Simulated shade percentage"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <SimulationMetric label="Heat Exposure" value={`${currentScore} → ${simulatedScore}`} />
          <SimulationMetric label={impactLabel} value={scoreDifference < 0 ? `↓ ${exposureReduction}%` : `${formattedDifference} points`} />
        </div>

        <p className="text-[11px] leading-relaxed text-slate-400">
          Simulated impact — based on HeatWise&apos;s prototype exposure model.
        </p>

        <button
          type="button"
          onClick={onReset}
          disabled={simulatedShade === currentShade && simulatedVegetation === currentVegetation}
          className="text-xs font-medium text-slate-500 underline decoration-slate-300 underline-offset-4 transition hover:text-slate-900 disabled:cursor-default disabled:opacity-40"
        >
          Reset
        </button>
      </div>
    </section>
  )
}

function SimulationMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-900/[0.03] px-3 py-2.5">
      <p className="text-[10px] font-semibold tracking-[0.12em] text-slate-400 uppercase">{label}</p>
      <p className="mt-1 font-semibold text-slate-800">{value}</p>
    </div>
  )
}

function estimatePedestriansPerDay(pedestrianDensityPct: number) {
  return Math.round(400 + pedestrianDensityPct * 16)
}

function IntelligenceGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold tracking-[0.14em] text-slate-400 uppercase">{title}</h4>
      <div className="mt-2">{children}</div>
    </div>
  )
}

function Factor({
  label,
  value,
  fill,
  cool = false,
}: {
  label: string
  value: string
  fill: number
  cool?: boolean
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <dt className="text-slate-500">{label}</dt>
        <dd className="font-medium text-slate-800">{value}</dd>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-900/8">
        <div
          className={`h-full rounded-full ${cool ? 'bg-teal-400' : 'bg-gradient-to-r from-amber-300 to-rose-400'}`}
          style={{ width: `${Math.min(100, Math.max(3, fill))}%` }}
        />
      </div>
    </div>
  )
}
