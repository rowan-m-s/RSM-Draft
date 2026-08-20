import { useState } from 'react'
import { Banner } from '../components/Banner'
import { CardImage, ManagerAvatar, PlayerPhoto } from '../components/Img'
import { PageBody } from '../components/Layout'
import { useData } from '../data'
import { money, signedMoney } from '../lib/season'
import type { ManagerKey, SeasonRow } from '../types'

/**
 * Balance colour. Pink for negative — it is one of pink's three reserved uses.
 * Green as text must be the ink variant; #00FF87 on white is invisible.
 */
function Balance({ amount, className = '' }: { amount: number; className?: string }) {
  const tone = amount < 0 ? 'text-pl-pink' : amount > 0 ? 'text-pl-green-ink' : 'text-pl-muted'
  return <span className={`tnum font-bold ${tone} ${className}`}>{signedMoney(amount)}</span>
}

function ManagerProfile({ row, onClose }: { row: SeasonRow; onClose: () => void }) {
  const { data } = useData()
  const ranked = data.gameweeks.some((gw) => gw.finished)
  const manager = data.league.managers.find((m) => m.key === row.key)!
  const nameOf = (key: string) => data.league.managers.find((m) => m.key === key)?.displayName ?? key

  const squad = data.players.owned
    .filter((p) => p.owner === row.key)
    .sort((a, b) => b.points - a.points)

  const kochWeeks = data.gameweeks.filter((gw) => gw.kochKeys.includes(row.key))
  const motmMonths = data.months.filter((m) => m.winnerKeys.includes(row.key))
  const best = squad[0] ?? null

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-black/40 p-0 sm:p-6" onClick={onClose}>
      <div
        className="mx-auto min-h-dvh max-w-3xl bg-pl-white sm:min-h-0 sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="banner-gradient flex items-start gap-4 rounded-t-lg px-5 py-5">
          <ManagerAvatar managerKey={row.key} size={64} className="h-16 w-16" />
          <div className="min-w-0 flex-1">
            <p className="display truncate text-3xl leading-none text-pl-white">{manager.displayName}</p>
            <p className="mt-1 truncate text-sm text-white/70">
              {manager.realName} · {manager.teamName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded px-2 py-1 text-white/70 hover:bg-white/10 hover:text-pl-white"
          >
            ✕
          </button>
        </div>
        <div className="banner-strip" />

        <div className="grid grid-cols-2 gap-px border-b border-pl-border bg-pl-border sm:grid-cols-4">
          {[
            { label: 'Rank', value: ranked ? String(row.rank) : '–' },
            { label: 'Points', value: String(row.total) },
            { label: 'Koch', value: String(row.kochCount) },
            { label: 'MOTM', value: String(row.motmCount) },
          ].map((stat) => (
            <div key={stat.label} className="bg-pl-white p-4">
              <p className="eyebrow text-pl-muted">{stat.label}</p>
              <p className="display tnum mt-1 text-2xl leading-none text-pl-navy">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="space-y-5 p-5">
          <section>
            <h3 className="eyebrow border-b-2 border-pl-cyan pb-1 text-pl-purple">Balance</h3>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <p className="text-sm text-pl-muted">
                Forfeits <span className="tnum font-semibold text-pl-navy">{money(row.forfeits)}</span>
              </p>
              <p className="text-sm text-pl-muted">
                Pots won <span className="tnum font-semibold text-pl-navy">{money(row.potsWon)}</span>
              </p>
              <p className="text-sm text-pl-muted">
                Balance <Balance amount={row.balance} className="text-lg" />
              </p>
            </div>
          </section>

          <section>
            <h3 className="eyebrow border-b-2 border-pl-cyan pb-1 text-pl-purple">Month by month</h3>
            <table className="mt-2 w-full">
              <tbody>
                {data.months
                  .filter((m) => m.gameweekIds.length > 0)
                  .map((m) => (
                    <tr key={m.id} className="border-b border-pl-border last:border-0">
                      <td className="py-2 text-sm text-pl-navy">{m.label}</td>
                      <td className="py-2 text-right text-xs text-pl-muted">
                        {m.settled ? (m.winnerKeys.includes(row.key) ? 'Won the pot' : 'Settled') : 'In progress'}
                      </td>
                      <td className="tnum w-16 py-2 text-right font-bold text-pl-navy">{m.totals[row.key] ?? 0}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>

          {best && (
            <section>
              <h3 className="eyebrow border-b-2 border-pl-cyan pb-1 text-pl-purple">Best performer</h3>
              <div className="mt-3 flex items-center gap-3">
                <PlayerPhoto
                  photoCode={best.photoCode}
                  name={best.name}
                  className="h-12 w-12 rounded-full bg-pl-off object-cover object-top"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-pl-navy">{best.name}</p>
                  <p className="text-xs text-pl-muted">
                    {best.position} · {best.clubShort}
                  </p>
                </div>
                <p className="display tnum text-2xl text-pl-navy">{best.points}</p>
              </div>
            </section>
          )}

          <section>
            <h3 className="eyebrow border-b-2 border-pl-cyan pb-1 text-pl-purple">
              Koch and MOTM history
            </h3>
            {kochWeeks.length === 0 && motmMonths.length === 0 ? (
              <p className="mt-3 text-sm text-pl-muted">Nothing yet. Not a bad thing.</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-3">
                {motmMonths.map((m) => (
                  <figure key={`motm-${m.id}`} className="w-32">
                    <CardImage
                      set="motm"
                      managerKey={row.key}
                      alt={`${nameOf(row.key)}, manager of the month`}
                      className="aspect-square w-32"
                    />
                    <figcaption className="mt-1 text-xs text-pl-muted">MOTM · {m.shortLabel}</figcaption>
                  </figure>
                ))}
                {kochWeeks.map((gw) => (
                  <figure key={`koch-${gw.id}`} className="w-32">
                    <CardImage
                      set="koch"
                      managerKey={row.key}
                      alt={`${nameOf(row.key)}, Koch of the week`}
                      className="aspect-square w-32"
                    />
                    <figcaption className="mt-1 text-xs text-pl-muted">
                      Koch · GW{gw.id} · {gw.scores[row.key]} pts
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="eyebrow border-b-2 border-pl-cyan pb-1 text-pl-purple">
              Current squad {squad.length > 0 && <span className="text-pl-muted">({squad.length})</span>}
            </h3>
            {squad.length === 0 ? (
              <p className="mt-3 text-sm text-pl-muted">No squad yet — it appears once the draft has happened.</p>
            ) : (
              <table className="mt-2 w-full">
                <tbody>
                  {squad.map((player) => (
                    <tr key={player.id} className="border-b border-pl-border last:border-0">
                      <td className="w-10 py-1.5">
                        <PlayerPhoto
                          photoCode={player.photoCode}
                          name={player.name}
                          className="h-8 w-8 rounded-full bg-pl-off object-cover object-top"
                        />
                      </td>
                      <td className="py-1.5 text-sm font-medium text-pl-navy">{player.name}</td>
                      <td className="py-1.5 text-right text-xs text-pl-muted">
                        {player.position} · {player.clubShort}
                      </td>
                      <td className="tnum w-14 py-1.5 pr-1 text-right font-bold text-pl-navy">{player.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

export function Managers() {
  const { data } = useData()
  const [open, setOpen] = useState<ManagerKey | null>(null)
  const nameOf = (key: string) => data.league.managers.find((m) => m.key === key)?.displayName ?? key

  // Sorted worst first — this is the page about who owes what.
  const rows = [...data.season.rows].sort((a, b) => a.balance - b.balance || b.total - a.total)
  // Before anyone has played there is no order to report, only an eleven-way tie.
  const ranked = data.gameweeks.some((gw) => gw.finished)
  const openRow = rows.find((r) => r.key === open) ?? null

  const totalBalance = rows.reduce((sum, r) => sum + r.balance, 0)
  const unpaidPot = data.months.filter((m) => !m.settled).reduce((sum, m) => sum + m.pot, 0)

  return (
    <>
      <Banner
        season={`Season ${data.league.season.replace('20', '').replace('/20', '/')}`}
        title="Managers"
        subtitle="Koch counts, months won, and what everyone is owed. Worst balance first."
      />

      <PageBody>
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-pl-border text-left">
                <th scope="col" className="py-2.5 pl-4 text-[11px] font-semibold tracking-wider text-pl-muted uppercase">
                  Manager
                </th>
                <th scope="col" className="hidden w-14 py-2.5 text-right text-[11px] font-semibold tracking-wider text-pl-muted uppercase sm:table-cell">
                  Rank
                </th>
                <th scope="col" className="hidden w-16 py-2.5 text-right text-[11px] font-semibold tracking-wider text-pl-muted uppercase sm:table-cell">
                  Points
                </th>
                <th scope="col" className="w-14 py-2.5 text-right text-[11px] font-semibold tracking-wider text-pl-muted uppercase">
                  Koch
                </th>
                <th scope="col" className="w-14 py-2.5 text-right text-[11px] font-semibold tracking-wider text-pl-muted uppercase">
                  MOTM
                </th>
                <th scope="col" className="w-20 py-2.5 pr-4 text-right text-[11px] font-semibold tracking-wider text-pl-muted uppercase">
                  Balance
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-pl-border last:border-0 hover:bg-pl-off">
                  <td className="py-2 pl-4">
                    <button
                      type="button"
                      onClick={() => setOpen(row.key)}
                      className="flex min-w-0 items-center gap-2.5 text-left"
                    >
                      <ManagerAvatar managerKey={row.key} size={32} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-pl-navy">{nameOf(row.key)}</span>
                        <span className="block truncate text-xs text-pl-muted sm:hidden">
                          {ranked && `${row.rank}${['st', 'nd', 'rd'][row.rank - 1] ?? 'th'} · `}
                          {row.total} pts
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className="tnum hidden py-2 text-right text-sm text-pl-muted sm:table-cell">
                    {ranked ? row.rank : '–'}
                  </td>
                  <td className="tnum hidden py-2 text-right font-semibold text-pl-navy sm:table-cell">{row.total}</td>
                  <td className="tnum py-2 text-right text-sm text-pl-navy">{row.kochCount}</td>
                  <td className="tnum py-2 text-right text-sm text-pl-navy">{row.motmCount}</td>
                  <td className="py-2 pr-4 text-right">
                    <Balance amount={row.balance} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-pl-muted">
          Balance is pots won minus £5 forfeits. The £10 entry fee is not part of it, and the £110 season prize is
          separate and still pending. Money only moves between managers, so once every gameweek in a month is
          confirmed the eleven balances cancel out —{' '}
          <span className="tnum font-semibold text-pl-navy">{signedMoney(totalBalance)}</span> right now, which is
          the {money(unpaidPot)} still sitting in an unsettled pot.
        </p>

        {openRow && <ManagerProfile row={openRow} onClose={() => setOpen(null)} />}
      </PageBody>
    </>
  )
}
