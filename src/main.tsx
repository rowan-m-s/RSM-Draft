import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createHashRouter } from 'react-router-dom'
import './index.css'
import { DataProvider } from './data'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { LeagueTable } from './pages/LeagueTable'
import { Managers } from './pages/Managers'
import { Squad } from './pages/Squad'
import { Players } from './pages/Players'
import { Fixtures } from './pages/Fixtures'
import { Honours } from './pages/Honours'

/**
 * Hash routing rather than browser routing: GitHub Pages serves static files
 * only, so a deep link to /players would 404 without a 404.html redirect dance.
 * Hash routing needs no server cooperation at all.
 *
 * A data router rather than the declarative <Routes> form, so that
 * <ScrollRestoration> can be used. Restoring scroll by hand means an effect
 * that fires on every render and cannot tell a fresh navigation from a back
 * button, which is the distinction that matters most here.
 */
const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'table', element: <LeagueTable /> },
      { path: 'managers', element: <Managers /> },
      { path: 'managers/:key/squad', element: <Squad /> },
      { path: 'players', element: <Players /> },
      { path: 'fixtures', element: <Fixtures /> },
      { path: 'honours', element: <Honours /> },
      { path: '*', element: <Home /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DataProvider>
      <RouterProvider router={router} />
    </DataProvider>
  </StrictMode>
)
