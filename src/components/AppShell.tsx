import { MapPinned, Route, Sun } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useLocation } from 'react-router-dom'
import { APP_NAME, APP_TAGLINE } from '../data/appConfig'
import { DEMO_AREA } from '../data/heatZones'
import { SimulatedDataBadge } from './SimulatedDataBadge'

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const isResident = location.pathname === '/resident' || location.pathname === '/routes'
  const navItems = isResident
    ? [
        { to: '/resident', label: 'Heat Map', icon: MapPinned },
        { to: '/routes', label: 'Route Mapping', icon: Route },
      ]
    : [{ to: '/city-intelligence', label: 'Abu Dhabi Urban Planning', icon: MapPinned }]
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 bg-white/55 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 to-rose-400 text-white shadow-md shadow-rose-300/40">
              <Sun className="h-5 w-5" />
            </span>
            <div>
              <p className="text-base leading-tight font-semibold tracking-tight text-slate-900">
                {APP_NAME}
              </p>
              <p className="text-xs text-slate-500">{APP_TAGLINE}</p>
            </div>
          </div>

          <nav className="order-3 w-full sm:order-none sm:w-auto">
            <ul className="flex gap-1 rounded-full bg-white/60 p-1 ring-1 ring-white/70">
              {navItems.map(({ to, label, icon: Icon }) => (
                <li key={to} className="flex-1 sm:flex-none">
                  <NavLink
                    to={to}
                    className={({ isActive }) =>
                      `flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
                        isActive
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'text-slate-500 hover:text-slate-900'
                      }`
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-slate-800">{DEMO_AREA.city}</p>
              <p className="text-xs text-slate-500">{DEMO_AREA.country}</p>
            </div>
            <SimulatedDataBadge />
            <NavLink to="/" className="hidden text-xs font-medium text-slate-500 transition hover:text-slate-900 sm:block">
              Switch experience
            </NavLink>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col px-4 pt-2 pb-6 sm:px-6">{children}</main>
    </div>
  )
}
