import type { ReactNode } from 'react'

type PanelProps = {
  title: string
  subtitle?: string
  actions?: ReactNode
  className?: string
  children: ReactNode
}

export function Panel({ title, subtitle, actions, className = '', children }: PanelProps) {
  return (
    <section
      className={`flex flex-col rounded-3xl bg-white/65 shadow-xl shadow-slate-900/10 ring-1 ring-white/70 backdrop-blur-xl ${className}`}
    >
      <header className="flex items-start justify-between gap-4 px-6 pt-5">
        <div>
          <h2 className="text-sm font-semibold tracking-[0.14em] text-slate-500 uppercase">
            {title}
          </h2>
          {subtitle && <p className="mt-1 text-xs text-slate-400">{subtitle}</p>}
        </div>
        {actions}
      </header>
      <div className="flex-1 p-6">{children}</div>
    </section>
  )
}

export function PlaceholderBlock({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 rounded-2xl bg-slate-900/[0.03] p-6 text-center">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      {hint && <p className="max-w-sm text-xs text-slate-400">{hint}</p>}
    </div>
  )
}
