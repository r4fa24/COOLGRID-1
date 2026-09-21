import { Building2, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { APP_NAME, APP_TAGLINE } from '../data/appConfig'

const roles = [
  {
    to: '/resident',
    icon: UserRound,
    title: 'Resident',
    description: 'Understand heat around you and find lower-exposure walking routes.',
    accent: 'from-teal-400 to-cyan-500',
  },
  {
    to: '/city-intelligence',
    icon: Building2,
    title: 'Abu Dhabi Urban Planning',
    description: 'Analyze urban heat and explore potential cooling interventions.',
    accent: 'from-amber-300 to-rose-400',
  },
]

export function RoleSelectionPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-5xl">
        <div className="mx-auto max-w-xl text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-300 to-rose-400 text-white shadow-xl shadow-rose-300/30">
            <span className="text-2xl font-semibold">H</span>
          </div>
          <p className="mt-5 text-sm font-semibold tracking-[0.18em] text-slate-500 uppercase">{APP_NAME}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">{APP_TAGLINE}</h1>
          <p className="mt-8 text-lg font-medium text-slate-700">How will you use CoolGrid?</p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {roles.map(({ to, icon: Icon, title, description, accent }) => (
            <Link
              key={to}
              to={to}
              className="group rounded-3xl bg-white/65 p-6 text-left shadow-xl shadow-slate-900/10 ring-1 ring-white/80 backdrop-blur-xl transition hover:-translate-y-1 hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-slate-900/30 sm:p-8"
            >
              <span className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${accent} text-white shadow-lg`}>
                <Icon className="h-6 w-6" />
              </span>
              <h2 className="mt-6 text-xl font-semibold text-slate-900">{title}</h2>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">{description}</p>
              <span className="mt-7 inline-flex text-sm font-semibold text-slate-700 transition group-hover:text-slate-900">
                Continue <span className="ml-2" aria-hidden="true">→</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}