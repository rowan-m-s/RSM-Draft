import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import { DataProvider } from './data'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { LeagueTable } from './pages/LeagueTable'
import { Managers } from './pages/Managers'
import { Squad } from './pages/Squad'
import { Players } from './pages/Players'
import { Honours } from './pages/Honours'

/**
 * HashRouter rather than BrowserRouter: GitHub Pages serves static files only,
 * so a deep link to /players would 404 without a 404.html redirect dance.
 * Hash routing needs no server cooperation at all.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DataProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="table" element={<LeagueTable />} />
            <Route path="managers" element={<Managers />} />
            <Route path="managers/:key/squad" element={<Squad />} />
            <Route path="players" element={<Players />} />
            <Route path="honours" element={<Honours />} />
            <Route path="*" element={<Home />} />
          </Route>
        </Routes>
      </HashRouter>
    </DataProvider>
  </StrictMode>
)
