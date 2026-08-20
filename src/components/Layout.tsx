import { NavLink, Outlet, ScrollRestoration } from 'react-router-dom'
import { useDataState } from '../data'
import { Freshness } from './Freshness'
import { ManagerAvatar } from './Img'
import type { SeasonRow } from '../types'

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/table', label: 'League Table', end: false },
  { to: '/managers', label: 'Managers', end: false },
  { to: '/players', label: 'Players', end: false },
  { to: '/honours', label: 'Honours', end: false },
]

/**
 * The accent bar on the left of a table row. Cyan for first, muted for second
 * and third, pink for last. Everyone else gets nothing.
 *
 * Before a gameweek has been played everyone is level on nothing, so the whole
 * table would light up cyan for an eleven-way tie for first. Correct, but it
 * reads as a bug — so there are no leaders until there is something to lead.
 */
export function rankAccent(rank: number, total: number, ranked = true): string {
  if (!ranked) return 'bg-transparent'
  if (rank === 1) return 'bg-pl-cyan'
  if (rank === 2 || rank === 3) return 'bg-pl-border'
  if (rank === total && total > 1) return 'bg-pl-pink'
  return 'bg-transparent'
}

/**
 * The compact league table pinned to the bottom of the sidebar — rank,
 * nickname, total. It persists on every page on desktop; on mobile it appears
 * inline on Home only, never in the tab bar.
 */
export function MiniTable({
  rows,
  nameOf,
  ranked = true,
}: {
  rows: SeasonRow[]
  nameOf: (key: string) => string
  ranked?: boolean
}) {
  return (
    <div>
      <p className="eyebrow border-b-2 border-pl-cyan pb-1 text-pl-purple">League table</p>
      <ol className="mt-2">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-2 border-b border-pl-border py-1 last:border-0">
            <span className={`h-5 w-0.5 shrink-0 rounded-full ${rankAccent(row.rank, rows.length, ranked)}`} />
            <span className="tnum w-4 shrink-0 text-xs text-pl-muted">{ranked ? row.rank : '–'}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-pl-navy">{nameOf(row.key)}</span>
            <span className="tnum text-sm font-bold text-pl-navy">{row.total}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main">
      <ul>
        {NAV.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                [
                  'flex items-center border-l-4 py-2 pl-4 pr-3 text-[15px] transition-colors',
                  isActive
                    ? 'border-pl-cyan bg-pl-off font-semibold text-pl-purple'
                    : 'border-transparent text-pl-navy hover:bg-pl-off',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Shown while the five JSON files are being read, and if they cannot be. */
function DataGate({ state }: { state: ReturnType<typeof useDataState>['state'] }) {
  if (state.status === 'loading') {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
        <p className="text-sm text-pl-muted">Loading…</p>
      </div>
    )
  }
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="card p-6">
        <p className="eyebrow text-pl-pink">Data unavailable</p>
        <p className="display mt-2 text-2xl text-pl-navy">Couldn’t load the league</p>
        <p className="mt-2 text-sm text-pl-muted">
          {state.status === 'error' ? state.message : 'Unknown error'}. The scheduled job may not have run yet.
        </p>
      </div>
    </div>
  )
}

export function Layout() {
  const { state } = useDataState()
  const data = state.status === 'ready' ? state.data : null
  const nameOf = (key: string) =>
    data?.league.managers.find((m) => m.key === key)?.displayName ?? key

  return (
    <div className="min-h-dvh lg:flex">
      {/*
        Scroll handling. Keyed per history entry, which is the default: a fresh
        navigation has no saved position and therefore starts at the top, while
        going back replays the position saved for that entry.

        Navigations that only rewrite the query string opt out individually
        with `preventScrollReset`, so dragging the gameweek slider does not
        yank the reader to the top mid interaction. Keying this component on
        the pathname instead looks like it would solve that, but does not: it
        restores the last position *saved* for the path, which on a slider drag
        is whatever it was when the page first loaded.
      */}
      <ScrollRestoration />
      {/* Desktop sidebar. Fixed, white, table pinned at the bottom. */}
      {/* The sidebar mark is a wordmark, not a second logo. The Premier League
          lion is white and would be invisible here; it belongs on the purple
          banners. */}
      <aside className="hidden w-[260px] shrink-0 border-r border-pl-border bg-pl-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <div className="px-4 pt-4 pb-3">
          <span className="flex gap-1">
            <span className="h-1 w-5 rounded-full bg-pl-cyan" />
            <span className="h-1 w-5 rounded-full bg-pl-green" />
            <span className="h-1 w-5 rounded-full bg-pl-pink" />
          </span>
          <p className="display mt-2 text-2xl leading-none text-pl-purple">FPL</p>
          <p className="text-xs text-pl-muted">Draft 26/27</p>
        </div>

        <div className="border-y border-pl-border py-1">
          <NavItems />
        </div>

        <div className="mt-auto min-h-0 overflow-y-auto px-4 py-3">
          {data && (
            <MiniTable
              rows={data.season.rows}
              nameOf={nameOf}
              ranked={data.gameweeks.some((gw) => gw.finished)}
            />
          )}
        </div>

        <div className="border-t border-pl-border px-4 py-2.5">
          <Freshness />
        </div>
      </aside>

      {/* Mobile top bar. */}
      <div className="flex items-center justify-between border-b border-pl-border bg-pl-white px-4 py-3 lg:hidden">
        <div>
          <p className="display text-base leading-none text-pl-purple">FPL</p>
          <p className="text-[11px] text-pl-muted">Draft 26/27</p>
        </div>
        <Freshness compact />
      </div>

      <main className="min-w-0 flex-1 pb-20 lg:pb-0">
        {data ? <Outlet /> : <DataGate state={state} />}
      </main>

      {/* Mobile bottom tabs. The mini table is not one of them — it lives
          inline on Home instead. */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-pl-border bg-pl-white pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="grid grid-cols-5">
          {NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  [
                    'flex h-14 flex-col items-center justify-center gap-1 border-t-2 px-1 text-center text-[11px] leading-tight',
                    isActive ? 'border-pl-cyan font-semibold text-pl-purple' : 'border-transparent text-pl-muted',
                  ].join(' ')
                }
              >
                {item.label === 'League Table' ? 'Table' : item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

/** Standard page body padding, so every view lines up. */
export function PageBody({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6">{children}</div>
}

export function ManagerAvatarWithName({
  managerKey,
  name,
  size = 28,
}: {
  managerKey: string
  name: string
  size?: number
}) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <ManagerAvatar managerKey={managerKey} size={size} />
      <span className="truncate font-semibold text-pl-navy">{name}</span>
    </span>
  )
}
