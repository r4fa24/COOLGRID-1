import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { CityIntelligencePage } from './pages/CityIntelligencePage'
import { RoutesPage } from './pages/RoutesPage'
import { RoleSelectionPage } from './pages/RoleSelectionPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RoleSelectionPage />} />
      <Route path="/resident" element={<AppShell><CityIntelligencePage planner={false} /></AppShell>} />
      <Route path="/city-intelligence" element={<AppShell><CityIntelligencePage /></AppShell>} />
      <Route path="/routes" element={<AppShell><RoutesPage /></AppShell>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
