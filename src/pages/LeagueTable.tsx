import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import { Banner } from '../components/Banner'
import { GameweekSlider } from '../components/GameweekSlider'
import { ManagerCell, PageBody, rankAccent } from '../components/Layout'
import { Segmented } from '../components/Segmented'
import { useData } from '../data'
import { money, rankLabel } from '../lib/season'
import type { Gameweek, ManagerKey, Month, TopPerformer } from '../types'

type View = 'gameweek' | 'month' | 'overall'

const VIEWS = [
  { value: 'gameweek' as const, label: 'Gameweek' },
  { value: 'month' as const, label: 'Month' },
  { value: 'overall' as const, label: 'Overall' },
]

const SUBTITLES: Record<View, string> = {
  gameweek: 'One gameweek at a time, with the Koch at the bottom.',
  month: 'Monthly totals, the pot and who took it.',
  overall: 'The season table. Top at the end takes £110.',
}

/**
 * The panel that drops in below an expanded row.
 *
 * Kept out of the row itself: the collapsed table stays five columns and
 * nothing else, which is the whole point of it reading in one second.
 *
 * The MVP is season long and deliberately does not follow the Gameweek /
 * Month / Overall toggle. It answers "who has been this manager's best player
 * this season", which is a fact about the squad rather than about whichever
 * slice of the table happens to be on screen.
 */
function RowDetail({
  managerKey,
  mvp,
  gameweek,
}: {
  managerKey: ManagerKey
  mvp: TopPerformer | null
  gameweek: number | null
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-pl-border bg-pl-surface-2 px-4 py-3">
      <div className="min-w-0">
        <p className="eyebrow text-pl-muted">MVP</p>
        {mvp ? (
          <p className="mt-1 truncate text-sm text-pl-text">
            <strong className="font-semibold">{mvp.playerName}</strong>{' '}
            <span className="tnum text-pl-muted">{mvp.points} pts</span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-pl-muted">No points scored yet.</p>
        )}
      </div>
      <Link
        to={`/managers/${managerKey}/squad${gameweek ? `?gw=${gameweek}` : ''}`}
        className="shrink-0 rounded-md bg-pl-text px-3.5 py-2 text-sm font-semibold text-pl-bg hover:bg-pl-muted"
      >
        View squad
      </Link>
    </div>
  )
}

/** Season-long MVP for a manager, wherever the panel is opened from. */
function useMvp() {
  const { data } = useData()
  return (key: ManagerKey) => data.season.rows.find((row) => row.key === key)?.topPerformer ?? null
}

/**
 * The season table. Five columns and nothing else — no averages, no counters,
 * no money. Those live on the Managers page. It should read in one second.
 */
function Overall() {
  const { data } = useData()
  const [open, setOpen] = useState<ManagerKey | null>(null)
  const rows = data.season.rows
  const nameOf = (key: string) => data.league.managers.find((m) => m.key === key)?.displayName ?? key
  const teamOf = (key: string) => data.league.managers.find((m) => m.key === key)?.teamName ?? ''
  const ranked = data.gameweeks.some((gw) => gw.started)

  return (
    <div className="card overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-pl-border text-left">
            <th
              scope="col"
              className="w-10 py-3 pl-3 text-[11px] sm:w-12 font-semibold tracking-wider text-pl-muted uppercase"
            >
              #
            </th>
            <th scope="col" className="py-3 text-[11px] font-semibold tracking-wider text-pl-muted uppercase">
              Manager
            </th>
            <th
              scope="col"
              className="w-10 py-3 text-right text-[11px] font-semibold tracking-wider text-pl-muted uppercase sm:w-14"
            >
              GW
            </th>
            <th
              scope="col"
              className="w-12 py-3 text-right text-[11px] font-semibold tracking-wider text-pl-muted uppercase sm:w-16"
            >
              Month
            </th>
            <th
              scope="col"
              className="w-14 py-3 pr-3 text-right text-[11px] font-semibold tracking-wider text-pl-muted uppercase sm:w-20 sm:pr-4"
            >
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const expanded = open === row.key
            return (
              <Fragment key={row.key}>
                <tr
                  onClick={() => setOpen(expanded ? null : row.key)}
                  aria-expanded={expanded}
                  className={`cursor-pointer border-b border-pl-border last:border-0 ${
                    expanded ? 'bg-pl-surface-2' : 'hover:bg-pl-surface-2'
                  }`}
                >
                  <td className="py-3 pl-3">
                    <span className="flex items-center gap-2">
                      <span className={`h-7 w-1 shrink-0 rounded-full ${rankAccent(row.rank, rows.length, ranked)}`} />
                      <span className="tnum text-sm text-pl-muted">{rankLabel(row.rank, ranked)}</span>
                    </span>
                  </td>
                  <td className="max-w-0 py-2.5 pl-3">
                    <ManagerCell managerKey={row.key} name={nameOf(row.key)} team={teamOf(row.key)} />
                  </td>
                  <td className="tnum py-3 text-right text-sm text-pl-muted">{row.gw}</td>
                  <td className="tnum py-3 text-right text-sm text-pl-muted">{row.month}</td>
                  <td className="tnum py-3 pr-3 text-right text-lg font-bold text-pl-text sm:pr-4">{row.total}</td>
                </tr>
                {expanded && (
                  <tr>
                    <td colSpan={5} className="p-0">
                      <RowDetail
                        managerKey={row.key}
                        mvp={row.topPerformer}
                        gameweek={data.season.latestSettledGameweek}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function GameweekView() {
  const { data } = useData()
  const nameOf = (key: string) => data.league.managers.find((m) => m.key === key)?.displayName ?? key

  // Finished weeks and the one in play, which shows live.
  const played = data.gameweeks.filter((gw) => gw.started)
  const latest = played.at(-1)?.id ?? data.gameweeks[0].id
  const [selected, setSelected] = useState(latest)

  const gameweek = data.gameweeks.find((gw) => gw.id === selected)!

  return (
    <>
      <GameweekSlider
        className="mb-4"
        value={selected}
        min={data.gameweeks[0].id}
        max={data.gameweeks.at(-1)!.id}
        onChange={setSelected}
        playTo={played.at(-1)?.id}
      />

      <GameweekTable gameweek={gameweek} nameOf={nameOf} />
    </>
  )
}

function GameweekTable({ gameweek, nameOf }: { gameweek: Gameweek; nameOf: (k: ManagerKey) => string }) {
  const { data } = useData()
  const teamOf = (key: string) => data.league.managers.find((m) => m.key === key)?.teamName ?? ''
  const mvpOf = useMvp()
  const [open, setOpen] = useState<ManagerKey | null>(null)

  if (!gameweek.started) {
    return (
      <div className="card p-8 text-center">
        <p className="display text-xl text-pl-text">Gameweek {gameweek.id} hasn't been played</p>
        <p className="mt-1.5 text-sm text-pl-muted">Scores appear once the first match kicks off.</p>
      </div>
    )
  }

  const provisional = !gameweek.dataChecked
  const ranked = [...data.season.rows]
    .map((row) => ({ key: row.key, points: gameweek.scores[row.key] ?? 0 }))
    .sort((a, b) => b.points - a.points)

  const lowest = Math.min(...ranked.map((r) => r.points))

  return (
    <div className={`card overflow-hidden ${provisional ? 'opacity-90' : ''}`}>
      {provisional && (
        <p className="border-b border-pl-border bg-pl-surface-2 px-4 py-3 text-sm text-pl-muted">
          <strong className="font-semibold text-pl-text">
            {gameweek.scoresProvisional ? 'Live.' : 'Provisional.'}
          </strong>{' '}
          {gameweek.scoresProvisional
            ? 'Scores are the XI as it stands; FPL applies automatic substitutions and confirms the points once the gameweek ends. No Koch and no money yet.'
            : "FPL hasn't confirmed the final points for this gameweek, so no Koch and no money yet."}
        </p>
      )}

      <table className="w-full">
        <tbody>
          {ranked.map((row, i) => {
            // The Koch is highlighted at the bottom, where they have sorted to.
            const isKoch = !provisional && gameweek.kochKeys.includes(row.key)
            const expanded = open === row.key
            return (
              <Fragment key={row.key}>
                <tr
                  onClick={() => setOpen(expanded ? null : row.key)}
                  aria-expanded={expanded}
                  className={[
                    'cursor-pointer border-b border-pl-border last:border-0',
                    isKoch ? 'bg-pl-pink/10' : expanded ? 'bg-pl-surface-2' : 'hover:bg-pl-surface-2',
                  ].join(' ')}
                >
                  <td className="w-10 py-3 pl-3">
                    <span className={`tnum text-sm ${isKoch ? 'font-semibold text-pl-pink' : 'text-pl-muted'}`}>
                      {rankLabel(i + 1)}
                    </span>
                  </td>
                  <td className="max-w-0 py-2.5 pl-3">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <ManagerCell managerKey={row.key} name={nameOf(row.key)} team={teamOf(row.key)} />
                      {isKoch && (
                        <span className="shrink-0 rounded bg-pl-pink px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-pl-bg uppercase">
                          Koch
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="w-20 py-3 pr-4 text-right">
                    <span
                      className={`display tnum text-xl ${
                        provisional ? 'text-pl-muted' : isKoch ? 'text-pl-pink' : 'text-pl-text'
                      }`}
                    >
                      {row.points}
                    </span>
                  </td>
                </tr>
                {expanded && (
                  <tr>
                    <td colSpan={3} className="p-0">
                      <RowDetail managerKey={row.key} mvp={mvpOf(row.key)} gameweek={gameweek.id} />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>

      {!provisional && (
        <p className="border-t border-pl-border bg-pl-surface-2 px-4 py-3 text-sm text-pl-text">
          {gameweek.kochKeys.length > 1 ? (
            <>
              {gameweek.kochKeys.length} managers tied on {lowest}. Each pays £5, so{' '}
              <strong className="font-semibold text-pl-pink">{money(gameweek.charged)}</strong> goes into the pot.
            </>
          ) : (
            <>
              <strong className="font-semibold text-pl-pink">{money(gameweek.charged)}</strong> into the pot.
            </>
          )}
        </p>
      )}
    </div>
  )
}

function MonthView({ selected, setSelected }: { selected: string | undefined; setSelected: (id: string) => void }) {
  const { data } = useData()
  const nameOf = (key: string) => data.league.managers.find((m) => m.key === key)?.displayName ?? key
  const month = data.months.find((m) => m.id === selected) ?? data.months[0]

  if (!month) {
    return (
      <div className="card p-8 text-center">
        <p className="display text-xl text-pl-text">No months yet</p>
        <p className="mt-1.5 text-sm text-pl-muted">The first month settles at the end of August.</p>
      </div>
    )
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        {data.months.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setSelected(m.id)}
            className={[
              'rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors',
              m.id === month.id
                ? 'border-pl-text bg-pl-text text-pl-bg'
                : 'border-pl-border bg-transparent text-pl-text hover:bg-pl-surface-2',
            ].join(' ')}
          >
            {m.shortLabel}
          </button>
        ))}
      </div>

      <MonthTable month={month} nameOf={nameOf} />
    </>
  )
}

function MonthTable({ month, nameOf }: { month: Month; nameOf: (k: ManagerKey) => string }) {
  const { data } = useData()
  const teamOf = (key: string) => data.league.managers.find((m) => m.key === key)?.teamName ?? ''
  const mvpOf = useMvp()
  const [open, setOpen] = useState<ManagerKey | null>(null)

  if (month.gameweekIds.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="display text-xl text-pl-text">{month.label} hasn't started</p>
        <p className="mt-1.5 text-sm text-pl-muted">Nothing to show until the first gameweek is played.</p>
      </div>
    )
  }

  const ranked = data.season.rows
    .map((row) => ({ key: row.key, points: month.totals[row.key] ?? 0 }))
    .sort((a, b) => b.points - a.points)

  // The pot only counts confirmed gameweeks, so say which ones those are
  // rather than listing every week the month has played.
  const inMonth = data.gameweeks.filter((gw) => gw.month === month.id && gw.started)
  const confirmed = inMonth.filter((gw) => gw.dataChecked)
  const provisional = inMonth.filter((gw) => !gw.dataChecked)
  // Everyone level on top leads together, as the settled view does with winners.
  const leading = ranked.filter((row) => row.points === ranked[0].points).map((row) => row.key)

  return (
    <div className="space-y-4">
      <div className="card grid gap-px overflow-hidden bg-pl-border sm:grid-cols-3">
        <div className="bg-pl-surface p-4">
          <p className="eyebrow text-pl-muted">Pot</p>
          <p className="display tnum mt-1.5 text-3xl leading-none text-pl-text">{money(month.pot)}</p>
          <p className="mt-1.5 text-xs text-pl-muted">
            GW{confirmed.map((gw) => gw.id).join(', GW')} confirmed
            {provisional.length > 0 && ` · GW${provisional.map((gw) => gw.id).join(', GW')} provisional`}
          </p>
        </div>
        <div className="bg-pl-surface p-4">
          <p className="eyebrow text-pl-muted">{month.settled ? 'Winner' : 'Leading'}</p>
          {month.settled ? (
            <>
              <p className="display mt-1.5 truncate text-2xl leading-[1.2] text-pl-text">
                {month.winnerKeys.map(nameOf).join(' & ')}
              </p>
              <p className="mt-1.5 text-xs text-pl-muted">
                Takes {money(month.potPerWinner)}
                {month.winnerKeys.length > 1 && ' each'}
              </p>
            </>
          ) : (
            <>
              <p className="display mt-1.5 truncate text-2xl leading-[1.2] text-pl-text">
                {leading.map(nameOf).join(' & ')}
              </p>
              <p className="mt-1.5 text-xs text-pl-muted">
                {leading.length > 1 ? 'Level, not settled yet' : 'Still running, not settled yet'}
              </p>
            </>
          )}
        </div>
        <div className="bg-pl-surface p-4">
          <p className="eyebrow text-pl-muted">Player of the month{!month.settled && ' (so far)'}</p>
          {month.topPerformer ? (
            <>
              <p className="display mt-1.5 truncate text-2xl leading-[1.2] text-pl-text">
                {month.topPerformer.playerName}
              </p>
              <p className="mt-1.5 text-xs text-pl-muted">
                for {nameOf(month.topPerformer.managerKey)}, {month.topPerformer.points} pts
              </p>
            </>
          ) : (
            <p className="mt-1.5 text-sm text-pl-muted">Not yet</p>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <tbody>
            {ranked.map((row, i) => {
              const isWinner = month.settled && month.winnerKeys.includes(row.key)
              const expanded = open === row.key
              return (
                <Fragment key={row.key}>
                  <tr
                    onClick={() => setOpen(expanded ? null : row.key)}
                    aria-expanded={expanded}
                    className={`cursor-pointer border-b border-pl-border last:border-0 ${expanded ? 'bg-pl-surface-2' : 'hover:bg-pl-surface-2'}`}
                  >
                    <td className="w-10 py-3 pl-3">
                      <span className="tnum text-sm text-pl-muted">{rankLabel(i + 1)}</span>
                    </td>
                    <td className="max-w-0 py-2.5 pl-3">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <ManagerCell managerKey={row.key} name={nameOf(row.key)} team={teamOf(row.key)} />
                        {isWinner && (
                          <span className="shrink-0 rounded bg-pl-green px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-pl-bg uppercase">
                            MOTM
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="w-20 py-3 pr-4 text-right">
                      <span className="display tnum text-xl text-pl-text">{row.points}</span>
                    </td>
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={3} className="p-0">
                        <RowDetail
                          managerKey={row.key}
                          mvp={mvpOf(row.key)}
                          gameweek={month.gameweekIds.at(-1) ?? null}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * The small money figure at the right of the view switch. Month: that
 * month's pot, £5 per Koch charge across its confirmed weeks (a tied week
 * charges everyone tied), "so far" until every week in the month has
 * confirmed, and £0 before any month exists so it does not pop in later.
 * Overall: the season prize, fixed, and named differently so it reads as a
 * different thing. Gameweek: nothing, because a single week has a £5
 * charge, not a prize.
 */
function Pot({ label, amount, qualifier }: { label: string; amount: number; qualifier?: string }) {
  return (
    <p className="text-right text-[11px] leading-tight text-pl-muted sm:text-xs">
      <span className="block sm:inline">{label} </span>
      <span className="tnum text-sm font-semibold text-pl-text">{money(amount)}</span>
      {qualifier && <span> {qualifier}</span>}
    </p>
  )
}

export function LeagueTable() {
  const { data } = useData()
  const [view, setView] = useState<View>('overall')

  const withGameweeks = data.months.filter((m) => m.gameweekIds.length > 0)
  const [selectedMonth, setSelectedMonth] = useState<string | undefined>(withGameweeks.at(-1)?.id ?? data.months[0]?.id)
  const month = data.months.find((m) => m.id === selectedMonth) ?? data.months[0] ?? null

  const pot =
    view === 'month' ? (
      <Pot label="Prize pot" amount={month?.pot ?? 0} qualifier={month?.settled ? undefined : 'so far'} />
    ) : view === 'overall' ? (
      <Pot label="Season prize" amount={data.season.seasonPrize} />
    ) : null

  return (
    <>
      <Banner
        season={`Season ${data.league.season.replace('20', '').replace('/20', '/')}`}
        title="League Table"
        subtitle={SUBTITLES[view]}
      />

      {/* The view switch sits directly under the banner, where the reference
          puts its tab strip, and above the table. */}
      <Segmented label="Showing" value={view} options={VIEWS} onChange={setView} aside={pot} />

      <PageBody>
        {view === 'overall' && <Overall />}
        {view === 'gameweek' && <GameweekView />}
        {view === 'month' && <MonthView selected={selectedMonth} setSelected={setSelectedMonth} />}
      </PageBody>
    </>
  )
}
