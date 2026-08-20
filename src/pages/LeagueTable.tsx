import { useState } from 'react'
import { Banner } from '../components/Banner'
import { ManagerAvatar } from '../components/Img'
import { PageBody, rankAccent } from '../components/Layout'
import { Segmented } from '../components/Segmented'
import { useData } from '../data'
import { money } from '../lib/season'
import type { Gameweek, ManagerKey, Month } from '../types'

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
 * The season table. Five columns and nothing else — no averages, no counters,
 * no money. Those live on the Managers page. It should read in one second.
 */
function Overall() {
  const { data } = useData()
  const rows = data.season.rows
  const nameOf = (key: string) => data.league.managers.find((m) => m.key === key)?.displayName ?? key
  const ranked = data.gameweeks.some((gw) => gw.finished)

  return (
    <div className="card overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-pl-border text-left">
            <th scope="col" className="w-10 py-2.5 pl-3 text-[11px] font-semibold tracking-wider text-pl-muted uppercase">
              #
            </th>
            <th scope="col" className="py-2.5 text-[11px] font-semibold tracking-wider text-pl-muted uppercase">
              Manager
            </th>
            <th scope="col" className="w-14 py-2.5 text-right text-[11px] font-semibold tracking-wider text-pl-muted uppercase">
              GW
            </th>
            <th scope="col" className="w-16 py-2.5 text-right text-[11px] font-semibold tracking-wider text-pl-muted uppercase">
              Month
            </th>
            <th scope="col" className="w-20 py-2.5 pr-4 text-right text-[11px] font-semibold tracking-wider text-pl-muted uppercase">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-pl-border last:border-0 hover:bg-pl-off">
              <td className="py-2.5 pl-3">
                <span className="flex items-center gap-2">
                  <span className={`h-7 w-1 shrink-0 rounded-full ${rankAccent(row.rank, rows.length, ranked)}`} />
                  <span className="tnum text-sm text-pl-muted">{ranked ? row.rank : '–'}</span>
                </span>
              </td>
              <td className="py-2.5">
                <span className="flex min-w-0 items-center gap-2.5">
                  <ManagerAvatar managerKey={row.key} size={28} />
                  <span className="truncate font-semibold text-pl-navy">{nameOf(row.key)}</span>
                </span>
              </td>
              <td className="tnum py-2.5 text-right text-sm text-pl-muted">{row.gw}</td>
              <td className="tnum py-2.5 text-right text-sm text-pl-muted">{row.month}</td>
              <td className="tnum py-2.5 pr-4 text-right text-lg font-bold text-pl-navy">{row.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GameweekView() {
  const { data } = useData()
  const nameOf = (key: string) => data.league.managers.find((m) => m.key === key)?.displayName ?? key

  const played = data.gameweeks.filter((gw) => gw.finished)
  const latest = played.at(-1)?.id ?? data.gameweeks[0].id
  const [selected, setSelected] = useState(latest)
  const [playing, setPlaying] = useState(false)

  const gameweek = data.gameweeks.find((gw) => gw.id === selected)!
  const first = data.gameweeks[0].id
  const last = data.gameweeks.at(-1)!.id

  const step = () => {
    setPlaying((wasPlaying) => {
      if (wasPlaying) return false
      let current = first
      setSelected(current)
      const id = setInterval(() => {
        current += 1
        if (current > (played.at(-1)?.id ?? first)) {
          clearInterval(id)
          setPlaying(false)
          return
        }
        setSelected(current)
      }, 700)
      return true
    })
  }

  return (
    <>
      <div className="card mb-4 flex items-center gap-3 p-3">
        <button
          type="button"
          onClick={step}
          aria-label={playing ? 'Stop' : 'Play through the season'}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-pl-purple text-pl-white hover:bg-pl-purple-deep"
        >
          {playing ? '■' : '▶'}
        </button>
        <input
          type="range"
          min={first}
          max={last}
          value={selected}
          onChange={(e) => setSelected(Number(e.target.value))}
          aria-label="Gameweek"
          className="gw-slider flex-1"
        />
        <span className="display tnum w-14 shrink-0 text-right text-xl text-pl-navy">GW{selected}</span>
      </div>

      <GameweekTable gameweek={gameweek} nameOf={nameOf} />
    </>
  )
}

function GameweekTable({ gameweek, nameOf }: { gameweek: Gameweek; nameOf: (k: ManagerKey) => string }) {
  const { data } = useData()

  if (!gameweek.finished) {
    return (
      <div className="card p-8 text-center">
        <p className="display text-xl text-pl-navy">Gameweek {gameweek.id} hasn't been played</p>
        <p className="mt-1.5 text-sm text-pl-muted">Scores appear once the gameweek starts.</p>
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
        <p className="border-b border-pl-border bg-pl-off px-4 py-2.5 text-sm text-pl-muted">
          <strong className="font-semibold text-pl-navy">Provisional.</strong> FPL hasn't confirmed the final points
          for this gameweek, so no Koch and no money yet.
        </p>
      )}

      <table className="w-full">
        <tbody>
          {ranked.map((row, i) => {
            // The Koch is highlighted at the bottom, where they have sorted to.
            const isKoch = !provisional && gameweek.kochKeys.includes(row.key)
            return (
              <tr
                key={row.key}
                className={[
                  'border-b border-pl-border last:border-0',
                  isKoch ? 'bg-pl-pink/5' : 'hover:bg-pl-off',
                ].join(' ')}
              >
                <td className="w-10 py-2.5 pl-3">
                  <span className={`tnum text-sm ${isKoch ? 'font-semibold text-pl-pink' : 'text-pl-muted'}`}>
                    {i + 1}
                  </span>
                </td>
                <td className="py-2.5">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <ManagerAvatar managerKey={row.key} size={28} />
                    <span className="truncate font-semibold text-pl-navy">{nameOf(row.key)}</span>
                    {isKoch && (
                      <span className="shrink-0 rounded bg-pl-pink px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-pl-white uppercase">
                        Koch
                      </span>
                    )}
                  </span>
                </td>
                <td className="w-20 py-2.5 pr-4 text-right">
                  <span
                    className={`display tnum text-xl ${
                      provisional ? 'text-pl-muted' : isKoch ? 'text-pl-pink' : 'text-pl-navy'
                    }`}
                  >
                    {row.points}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {!provisional && (
        <p className="border-t border-pl-border bg-pl-off px-4 py-3 text-sm text-pl-navy">
          {gameweek.kochKeys.length > 1 ? (
            <>
              {gameweek.kochKeys.length} managers tied on {lowest}. Each pays £5 —{' '}
              <strong className="font-semibold text-pl-pink">{money(gameweek.charged)}</strong> into the pot.
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

function MonthView() {
  const { data } = useData()
  const nameOf = (key: string) => data.league.managers.find((m) => m.key === key)?.displayName ?? key

  const withGameweeks = data.months.filter((m) => m.gameweekIds.length > 0)
  const [selected, setSelected] = useState(withGameweeks.at(-1)?.id ?? data.months[0]?.id)
  const month = data.months.find((m) => m.id === selected) ?? data.months[0]

  if (!month) {
    return (
      <div className="card p-8 text-center">
        <p className="display text-xl text-pl-navy">No months yet</p>
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
              'rounded-md px-3 py-1.5 text-sm font-semibold',
              m.id === month.id
                ? 'bg-pl-purple text-pl-white'
                : 'border border-pl-border bg-pl-white text-pl-navy hover:bg-pl-off',
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

  if (month.gameweekIds.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="display text-xl text-pl-navy">{month.label} hasn't started</p>
        <p className="mt-1.5 text-sm text-pl-muted">Nothing to show until the first gameweek is played.</p>
      </div>
    )
  }

  const ranked = data.season.rows
    .map((row) => ({ key: row.key, points: month.totals[row.key] ?? 0 }))
    .sort((a, b) => b.points - a.points)

  // The pot only counts confirmed gameweeks, so say which ones those are
  // rather than listing every week the month has played.
  const inMonth = data.gameweeks.filter((gw) => gw.month === month.id && gw.finished)
  const confirmed = inMonth.filter((gw) => gw.dataChecked)
  const provisional = inMonth.filter((gw) => !gw.dataChecked)

  return (
    <div className="space-y-4">
      <div className="card grid gap-px overflow-hidden bg-pl-border sm:grid-cols-3">
        <div className="bg-pl-white p-4">
          <p className="eyebrow text-pl-muted">Pot</p>
          <p className="display tnum mt-1.5 text-3xl leading-none text-pl-navy">{money(month.pot)}</p>
          <p className="mt-1.5 text-xs text-pl-muted">
            GW{confirmed.map((gw) => gw.id).join(', GW')} confirmed
            {provisional.length > 0 && ` · GW${provisional.map((gw) => gw.id).join(', GW')} provisional`}
          </p>
        </div>
        <div className="bg-pl-white p-4">
          <p className="eyebrow text-pl-muted">{month.settled ? 'Winner' : 'Leading'}</p>
          {month.settled ? (
            <>
              <p className="display mt-1.5 truncate text-2xl leading-none text-pl-navy">
                {month.winnerKeys.map(nameOf).join(' & ')}
              </p>
              <p className="mt-1.5 text-xs text-pl-muted">
                Takes {money(month.potPerWinner)}
                {month.winnerKeys.length > 1 && ' each'}
              </p>
            </>
          ) : (
            <>
              <p className="display mt-1.5 truncate text-2xl leading-none text-pl-navy">{nameOf(ranked[0].key)}</p>
              <p className="mt-1.5 text-xs text-pl-muted">Not settled — the month is still running</p>
            </>
          )}
        </div>
        <div className="bg-pl-white p-4">
          <p className="eyebrow text-pl-muted">Top performer</p>
          {month.topPerformer ? (
            <>
              <p className="display mt-1.5 truncate text-2xl leading-none text-pl-navy">
                {month.topPerformer.playerName}
              </p>
              <p className="mt-1.5 text-xs text-pl-muted">
                for {nameOf(month.topPerformer.managerKey)} — {month.topPerformer.points} pts
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
              return (
                <tr key={row.key} className="border-b border-pl-border last:border-0 hover:bg-pl-off">
                  <td className="w-10 py-2.5 pl-3">
                    <span className="tnum text-sm text-pl-muted">{i + 1}</span>
                  </td>
                  <td className="py-2.5">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <ManagerAvatar managerKey={row.key} size={28} />
                      <span className="truncate font-semibold text-pl-navy">{nameOf(row.key)}</span>
                      {isWinner && (
                        <span className="shrink-0 rounded bg-pl-purple px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-pl-white uppercase">
                          MOTM
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="w-20 py-2.5 pr-4 text-right">
                    <span className="display tnum text-xl text-pl-navy">{row.points}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function LeagueTable() {
  const { data } = useData()
  const [view, setView] = useState<View>('overall')

  return (
    <>
      {/* The toggle sits above the banner, where the reference puts its league
          switcher. */}
      <Segmented label="Showing" value={view} options={VIEWS} onChange={setView} />

      <Banner
        season={`Season ${data.league.season.replace('20', '').replace('/20', '/')}`}
        title="League Table"
        subtitle={SUBTITLES[view]}
      />

      <PageBody>
        {view === 'overall' && <Overall />}
        {view === 'gameweek' && <GameweekView />}
        {view === 'month' && <MonthView />}
      </PageBody>
    </>
  )
}
