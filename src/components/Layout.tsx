import { NavLink, Outlet, ScrollRestoration } from 'react-router-dom'
import { useDataState } from '../data'
import { Freshness } from './Freshness'
import { ManagerAvatar } from './Img'
import { LION_ONLY } from '../lib/assets'
import { rankLabel } from '../lib/season'
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
      <p className="eyebrow border-b border-pl-border pb-2 text-pl-muted">League table</p>
      <ol className="mt-1">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-2 border-b border-pl-border py-1.5 last:border-0">
            <span className={`h-5 w-0.5 shrink-0 rounded-full ${rankAccent(row.rank, rows.length, ranked)}`} />
            <span className="tnum w-5 shrink-0 text-xs text-pl-muted">{rankLabel(row.rank, ranked)}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-pl-text">{nameOf(row.key)}</span>
            <span className="tnum text-sm font-bold text-pl-text">{row.total}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/**
 * The Fantasy Draft mark: the lion, then "Fantasy" bold and "Draft" light,
 * white on aubergine. Set as live text rather than the supplied image, which
 * has a violet gradient baked in that would not sit on our surface.
 */
function Mark({ compact = false }: { compact?: boolean }) {
  const lion = compact ? 'h-6' : 'h-8'
  const size = compact ? 'text-lg' : 'text-[22px]'
  return (
    <span className="flex items-center gap-2">
      <img src={LION_ONLY} alt="" width={155} height={210} className={`${lion} w-auto shrink-0`} />
      <span className={`font-mark flex gap-[0.22em] leading-none tracking-tight text-pl-text ${size}`}>
        <span className="font-bold">Fantasy</span>
        <span className="font-light">Draft</span>
      </span>
    </span>
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
                  'flex items-center border-l-[3px] py-2.5 pl-4 pr-3 text-[15px] transition-colors',
                  isActive
                    ? 'border-pl-cyan font-semibold text-pl-text'
                    : 'border-transparent text-pl-muted hover:bg-pl-surface hover:text-pl-text',
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
        <p className="eyebrow text-pl-amber">Data unavailable</p>
        <p className="display mt-2 text-2xl text-pl-text">Couldn’t load the league</p>
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
      {/* Desktop sidebar. Fixed, on the page colour, table pinned at the
          bottom on a raised surface. */}
      <aside className="hidden w-[260px] shrink-0 border-r border-pl-border bg-pl-bg lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <div className="px-4 pt-5 pb-4">
          <Mark />
          <p className="mt-1.5 pl-10 text-xs text-pl-muted">RSM · 26/27</p>
        </div>

        <div className="border-y border-pl-border py-2">
          <NavItems />
        </div>

        <div className="mt-auto min-h-0 overflow-y-auto p-3">
          {data && (
            <div className="card px-3 py-3">
              <MiniTable
                rows={data.season.rows}
                nameOf={nameOf}
                ranked={data.gameweeks.some((gw) => gw.finished)}
              />
            </div>
          )}
        </div>

        <div className="border-t border-pl-border px-4 py-2.5">
          <Freshness />
        </div>
      </aside>

      {/* Mobile top bar. */}
      <div className="flex items-center justify-between border-b border-pl-border bg-pl-bg px-4 py-3 lg:hidden">
        <Mark compact />
        <Freshness compact />
      </div>

      <main className="min-w-0 flex-1 pb-20 lg:pb-0">
        {data ? <Outlet /> : <DataGate state={state} />}
      </main>

      {/* Mobile bottom tabs. The mini table is not one of them — it lives
          inline on Home instead. */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-pl-border bg-pl-bg pb-[env(safe-area-inset-bottom)] lg:hidden"
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
                    isActive ? 'border-pl-cyan font-semibold text-pl-text' : 'border-transparent text-pl-muted',
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
  return <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
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
      <span className="truncate font-semibold text-pl-text">{name}</span>
    </span>
  )
}
