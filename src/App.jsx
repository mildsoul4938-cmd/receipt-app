import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Capture from './pages/Capture.jsx'
import Confirm from './pages/Confirm.jsx'
import List from './pages/List.jsx'
import Settings from './pages/Settings.jsx'
import BottomNav from './components/BottomNav.jsx'

export default function App() {
  return (
    <HashRouter>
      <div className="app-shell">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/capture" element={<Capture />} />
          <Route path="/confirm" element={<Confirm />} />
          <Route path="/list" element={<List />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <BottomNav />
      </div>
    </HashRouter>
  )
}
