import { Banner } from '../components/Banner'
import { DeadlineStrip } from '../components/Countdown'
import { DataFooter } from '../components/Freshness'
import { CardImage, ManagerAvatar } from '../components/Img'
import { MiniTable, PageBody } from '../components/Layout'
import { useData } from '../data'
import { kochesOf, money, monthWinnersOf } from '../lib/season'
import type { Gameweek, Leader, ManagerKey, Month } from '../types'

/**
 * The empty state that greets everyone for the first four or five weeks.
 * Designed rather than hidden — leaving a hole where the biggest card on the
 * page should be looks like a bug.
 */
function AwaitingAward({ title, eyebrow, when }: { title: string; eyebrow: string; when: string }) {
  return (
    <section className="card p-6">
      <p className="eyebrow text-pl-muted">{eyebrow}</p>
      <p className="display mt-2 text-2xl text-pl-text">{title}</p>
      <p className="mt-1.5 text-sm text-pl-muted">{when}</p>
      <div className="mt-4 flex h-32 items-center justify-center rounded-md border border-dashed border-pl-border bg-pl-bg/40">
        <p className="text-sm text-pl-muted">No card yet</p>
      </div>
    </section>
  )
}

/** dd/MM in London, for the "confirmed 26/08" line. */
function shortDate(iso: string | null): string {
  if (!iso) return 'soon'
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: '2-digit' }).format(
    new Date(iso)
  )
}

/**
 * The caveat on a live award. Small, muted, top right: the graphic is still
 * the point. Disappears the moment the week or month is confirmed.
 */
function Provisional({ award, confirmedOn }: { award: 'KOTW' | 'MOTM'; confirmedOn: string | null }) {
  return (
    <p className="text-right text-[11px] leading-tight text-pl-muted">
      *As things stand.
      <br className="sm:hidden" /> {award} confirmed {shortDate(confirmedOn)}
    </p>
  )
}

/**
 * Koch of the week. Live from the moment a week has scores, marked as things
 * stand; final once FPL confirms the week. Nothing about money appears until
 * then: confirmation is what attaches the £5, and a provisional Koch is just
 * who is bottom right now.
 */
function KochCard({ gameweek, nameOf }: { gameweek: Gameweek; nameOf: (key: ManagerKey) => string }) {
  const confirmed = gameweek.dataChecked
  const koches = confirmed ? gameweek.kochKeys : kochesOf(gameweek.scores)
  const tied = koches.length > 1

  return (
    <section className="card overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-pl-border px-5 py-3">
        <div>
          <p className="eyebrow text-pl-pink">Koch of the week</p>
          <p className="mt-0.5 text-xs text-pl-muted">
            Gameweek {gameweek.id}
            {tied && ` · ${koches.length}-way tie`}
          </p>
        </div>
        {!confirmed && <Provisional award="KOTW" confirmedOn={gameweek.confirmExpectedUtc} />}
      </div>

      <div className={`grid gap-px bg-pl-border ${tied ? 'lg:grid-cols-2' : ''}`}>
        {koches.map((key) => (
          <div key={key} className="flex flex-col gap-5 bg-pl-surface p-5 sm:flex-row sm:items-center">
            {/* Square frame. The cards are all square today, but the frame
                letterboxes anything that isn't rather than cropping a head off. */}
            <CardImage
              set="koch"
              managerKey={key}
              alt={`${nameOf(key)}, Koch of the week`}
              className="aspect-square w-full shrink-0 sm:w-64"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <ManagerAvatar managerKey={key} size={48} className="h-12 w-12" />
                <p className="display min-w-0 truncate text-4xl leading-[1.2] text-pl-text">
                  {nameOf(key)}
                  {!confirmed && '*'}
                </p>
              </div>
              <p className="mt-4 flex items-baseline gap-2">
                <span className="display tnum text-6xl leading-none text-pl-pink">{gameweek.scores[key]}</span>
                <span className="text-sm text-pl-muted">points</span>
              </p>
              <p className="mt-3 text-sm text-pl-muted">
                {confirmed ? 'Lowest score' : 'Currently lowest'} in gameweek {gameweek.id}
              </p>
            </div>
          </div>
        ))}
      </div>

      {confirmed && (
        <p className="border-t border-pl-border bg-pl-surface-2 px-5 py-3 text-sm text-pl-text">
          {tied ? (
            <>
              All {koches.length} tied on {gameweek.scores[koches[0]]}, so all {koches.length} pay.{' '}
              <strong className="font-semibold text-pl-pink">{money(gameweek.charged)}</strong> into the month's pot.
            </>
          ) : (
            <>
              <strong className="font-semibold text-pl-pink">{money(gameweek.charged)}</strong> into the month's pot.
            </>
          )}
        </p>
      )}
    </section>
  )
}

/**
 * Manager of the month. Live from the month's first scores, marked as things
 * stand and with no pot attached; final once the month's last gameweek is
 * confirmed. The expected confirmation is that last gameweek's.
 */
function MotmCard({
  month,
  nameOf,
  confirmedOn,
}: {
  month: Month
  nameOf: (key: ManagerKey) => string
  confirmedOn: string | null
}) {
  const confirmed = month.settled
  const winners = confirmed ? month.winnerKeys : monthWinnersOf(month.totals)
  const split = winners.length > 1

  return (
    <section className="card overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-pl-border px-5 py-3">
        <div>
          <p className="eyebrow text-pl-green">Manager of the month</p>
          <p className="mt-0.5 text-xs text-pl-muted">
            {month.label}
            {split && (confirmed ? ` · split ${winners.length} ways` : ` · ${winners.length} level`)}
          </p>
        </div>
        {!confirmed && <Provisional award="MOTM" confirmedOn={confirmedOn} />}
      </div>

      <div className={`grid gap-px bg-pl-border ${split ? 'sm:grid-cols-2' : ''}`}>
        {winners.map((key) => (
          <div key={key} className="flex gap-4 bg-pl-surface p-5">
            <CardImage
              set="motm"
              managerKey={key}
              alt={`${nameOf(key)}, manager of the month`}
              className="aspect-square w-28 shrink-0 sm:w-36"
            />
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <p className="display truncate text-2xl leading-[1.2] text-pl-text">
                {nameOf(key)}
                {!confirmed && '*'}
              </p>
              <p className="mt-1.5 text-sm text-pl-muted">
                <span className="tnum font-semibold text-pl-text">{month.totals[key]}</span> points across{' '}
                {month.gameweekIds.length} gameweek{month.gameweekIds.length === 1 ? '' : 's'}
              </p>
              {confirmed && (
                <p className="mt-2">
                  <span className="display tnum text-2xl text-pl-green">{money(month.potPerWinner)}</span>{' '}
                  <span className="text-sm text-pl-muted">won</span>
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {month.topPerformer && (
        <p className="border-t border-pl-border bg-pl-surface-2 px-5 py-3 text-sm text-pl-text">
          Top performer: <strong className="font-semibold">{month.topPerformer.playerName}</strong> for{' '}
          {nameOf(month.topPerformer.managerKey)},{' '}
          <span className="tnum font-semibold">{month.topPerformer.points}</span> pts
        </p>
      )}
    </section>
  )
}

/**
 * League Leader: whoever is top of the season table, derived from confirmed
 * gameweeks. Never provisional, since a table is a table. What changes week
 * to week is the run: how long they have led, and when the top changes
 * hands, who was displaced. Joint leaders share the card.
 */
function LeaderCard({ leader, nameOf }: { leader: Leader; nameOf: (key: ManagerKey) => string }) {
  const joint = leader.keys.length > 1
  const run =
    leader.weeks === 1
      ? `Leading since GW${leader.since}`
      : `Leading since GW${leader.since} · ${leader.weeks} weeks at the top`

  return (
    <section className="card overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-pl-border px-5 py-3">
        <div>
          <p className="eyebrow text-pl-cyan">{joint ? 'Joint league leaders' : 'League leader'}</p>
          <p className="mt-0.5 text-xs text-pl-muted">After gameweek {leader.asOf}</p>
        </div>
        {leader.changed && (
          <span className="rounded bg-pl-cyan px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-pl-bg uppercase">
            New leader
          </span>
        )}
      </div>

      <div className={`grid gap-px bg-pl-border ${joint ? 'sm:grid-cols-2' : ''}`}>
        {leader.keys.map((key) => (
          <div key={key} className="flex gap-4 bg-pl-surface p-5">
            <CardImage
              set="leader"
              managerKey={key}
              alt={`${nameOf(key)}, league leader`}
              className="aspect-square w-28 shrink-0 sm:w-36"
            />
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <p className="display truncate text-2xl leading-[1.2] text-pl-text">{nameOf(key)}</p>
              <p className="mt-1.5 text-sm text-pl-muted">
                <span className="tnum font-semibold text-pl-text">{leader.total}</span> points
              </p>
              <p className="mt-2 text-sm text-pl-cyan">
                {joint && leader.sinceByKey[key] !== leader.since
                  ? `Drew level at GW${leader.sinceByKey[key]}`
                  : run}
              </p>
            </div>
          </div>
        ))}
      </div>

      {leader.changed && leader.displaced && (
        <p className="border-t border-pl-border bg-pl-surface-2 px-5 py-3 text-sm text-pl-text">
          Took over from <strong className="font-semibold">{nameOf(leader.displaced)}</strong> at gameweek{' '}
          {leader.asOf}.
        </p>
      )}
    </section>
  )
}

function MoneyStrip({ month, prize, nameOf }: { month: Month | null; prize: number; nameOf: (k: ManagerKey) => string }) {
  const { data } = useData()
  const leader = data.season.rows[0]
  const anyPlayed = data.gameweeks.some((gw) => gw.finished)
  // Only confirmed gameweeks have money attached, so count those rather than
  // every gameweek the month has played.
  const confirmed = month ? data.gameweeks.filter((gw) => gw.month === month.id && gw.dataChecked).length : 0

  return (
    <section className="card grid gap-px overflow-hidden bg-pl-border sm:grid-cols-2">
      <div className="bg-pl-surface p-5">
        <p className="eyebrow text-pl-muted">{month ? `${month.shortLabel} pot so far` : 'This month’s pot'}</p>
        <p className="display tnum mt-2 text-4xl leading-none text-pl-text">{money(month?.pot ?? 0)}</p>
        <p className="mt-2 text-sm text-pl-muted">
          {month
            ? `£5 per Koch across ${confirmed} confirmed gameweek${confirmed === 1 ? '' : 's'}. Winner takes all.`
            : 'Grows by £5 every time someone finishes bottom.'}
        </p>
      </div>
      <div className="bg-pl-surface p-5">
        <p className="eyebrow text-pl-muted">Season prize</p>
        <p className="display tnum mt-2 text-4xl leading-none text-pl-text">{money(prize)}</p>
        <p className="mt-2 text-sm text-pl-muted">
          {anyPlayed ? (
            <>
              Top of the table at season end. Currently{' '}
              <strong className="font-semibold text-pl-text">{nameOf(leader.key)}</strong>.
            </>
          ) : (
            'Top of the table at season end. £10 each, eleven managers.'
          )}
        </p>
      </div>
    </section>
  )
}

export function Home() {
  const { data } = useData()
  const nameOf = (key: string) => data.league.managers.find((m) => m.key === key)?.displayName ?? key

  // The Koch card shows the latest week that has any scores: live and marked
  // as things stand while unconfirmed, final once FPL confirms it.
  const latestKoch = [...data.gameweeks].reverse().find((gw) => Object.keys(gw.scores).length > 0) ?? null
  const provisional = latestKoch && !latestKoch.dataChecked ? latestKoch : null

  // Likewise the month: the latest with any gameweeks played.
  const latestMotm = [...data.months].reverse().find((m) => m.gameweekIds.length > 0) ?? null
  const motmConfirmedOn = latestMotm
    ? (data.gameweeks
        .filter((gw) => gw.month === latestMotm.id)
        .map((gw) => gw.confirmExpectedUtc)
        .filter((x): x is string => Boolean(x))
        .sort()
        .at(-1) ?? null)
    : null

  const currentMonth = data.months.find((m) => m.id === data.season.currentMonth) ?? null

  return (
    <>
      <Banner
        season={`Season ${data.league.season.replace('20', '').replace('/20', '/')}`}
        title="RSM Draft"
        subtitle="Eleven managers. Weekly punishments and monthly prizes."
      />

      <PageBody>
        <div className="space-y-6">
          <DeadlineStrip gameweeks={data.gameweeks} />

          {provisional?.finished && (
            <p className="rounded-md border border-pl-border bg-pl-surface px-4 py-3 text-sm text-pl-muted">
              Gameweek {provisional.id} has finished but FPL has not confirmed the final points yet. It shows as
              things stand and no money is attached until it does.
            </p>
          )}

          {latestKoch ? (
            <KochCard gameweek={latestKoch} nameOf={nameOf} />
          ) : (
            <AwaitingAward
              eyebrow="Koch of the week"
              title="No Koch yet"
              when="First award: when gameweek 1 is confirmed, Saturday 22 August."
            />
          )}

          {latestMotm ? (
            <MotmCard month={latestMotm} nameOf={nameOf} confirmedOn={motmConfirmedOn} />
          ) : (
            <AwaitingAward
              eyebrow="Manager of the month"
              title="No manager of the month yet"
              when="First award: end of August."
            />
          )}

          {data.season.leader ? (
            <LeaderCard leader={data.season.leader} nameOf={nameOf} />
          ) : (
            <AwaitingAward
              eyebrow="League leader"
              title="No leader yet"
              when="Top of the table once gameweek 1 is confirmed, Saturday 22 August."
            />
          )}

          <MoneyStrip month={currentMonth} prize={data.season.seasonPrize} nameOf={nameOf} />

          {/* The compact table appears inline on Home for mobile, since the
              sidebar that normally holds it is not there. */}
          <section className="card p-4 lg:hidden">
            <MiniTable
              rows={data.season.rows}
              nameOf={nameOf}
              ranked={data.gameweeks.some((gw) => gw.finished)}
            />
          </section>

          <DataFooter />
        </div>
      </PageBody>
    </>
  )
}
