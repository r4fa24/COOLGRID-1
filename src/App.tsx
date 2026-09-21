import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { CityIntelligencePage } from './pages/CityIntelligencePage'
import { RoleSelectionPage } from './pages/RoleSelectionPage'

const RoutesPage = lazy(() =>
  import('./pages/RoutesPage').then(({ RoutesPage: routePage }) => ({ default: routePage })),
)

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RoleSelectionPage />} />
      <Route path="/resident" element={<AppShell><CityIntelligencePage planner={false} /></AppShell>} />
      <Route path="/city-intelligence" element={<AppShell><CityIntelligencePage /></AppShell>} />
      <Route
        path="/routes"
        element={
          <Suspense fallback={<AppShell><div className="flex min-h-0 flex-1" /></AppShell>}>
            <AppShell><RoutesPage /></AppShell>
          </Suspense>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
