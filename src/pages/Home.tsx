import { Banner } from '../components/Banner'
import { DeadlineStrip } from '../components/Countdown'
import { DataFooter } from '../components/Freshness'
import { CardImage, ManagerAvatar } from '../components/Img'
import { MiniTable, PageBody } from '../components/Layout'
import { useData } from '../data'
import { money } from '../lib/season'
import type { Gameweek, ManagerKey, Month } from '../types'

/**
 * The empty state that greets everyone for the first four or five weeks.
 * Designed rather than hidden — leaving a hole where the biggest card on the
 * page should be looks like a bug.
 */
function AwaitingAward({ title, eyebrow, when }: { title: string; eyebrow: string; when: string }) {
  return (
    <section className="card p-6">
      <p className="eyebrow text-pl-muted">{eyebrow}</p>
      <p className="display mt-2 text-2xl text-pl-navy">{title}</p>
      <p className="mt-1.5 text-sm text-pl-muted">{when}</p>
      <div className="mt-4 flex h-32 items-center justify-center rounded-md border border-dashed border-pl-border bg-pl-off">
        <p className="text-sm text-pl-muted">No card yet</p>
      </div>
    </section>
  )
}

function KochCard({ gameweek, nameOf }: { gameweek: Gameweek; nameOf: (key: ManagerKey) => string }) {
  const koches = gameweek.kochKeys
  const tied = koches.length > 1

  return (
    <section className="card overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 border-b border-pl-border px-5 py-3">
        <p className="eyebrow text-pl-pink">Koch of the week</p>
        <p className="text-xs text-pl-muted">
          Gameweek {gameweek.id}
          {tied && ` · ${koches.length}-way tie`}
        </p>
      </div>

      <div className={`grid gap-px bg-pl-border ${tied ? 'lg:grid-cols-2' : ''}`}>
        {koches.map((key) => (
          <div key={key} className="flex flex-col gap-5 bg-pl-white p-5 sm:flex-row sm:items-center">
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
                <p className="display min-w-0 truncate text-4xl leading-none text-pl-navy">{nameOf(key)}</p>
              </div>
              <p className="mt-4 flex items-baseline gap-2">
                <span className="display tnum text-6xl leading-none text-pl-pink">{gameweek.scores[key]}</span>
                <span className="text-sm text-pl-muted">points</span>
              </p>
              <p className="mt-3 text-sm text-pl-muted">Lowest score in gameweek {gameweek.id}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="border-t border-pl-border bg-pl-off px-5 py-3 text-sm text-pl-navy">
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
    </section>
  )
}

function MotmCard({ month, nameOf }: { month: Month; nameOf: (key: ManagerKey) => string }) {
  const winners = month.winnerKeys
  const split = winners.length > 1

  return (
    <section className="card overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 border-b border-pl-border px-5 py-3">
        <p className="eyebrow text-pl-cyan-ink">Manager of the month</p>
        <p className="text-xs text-pl-muted">
          {month.label}
          {split && ` · split ${winners.length} ways`}
        </p>
      </div>

      <div className={`grid gap-px bg-pl-border ${split ? 'sm:grid-cols-2' : ''}`}>
        {winners.map((key) => (
          <div key={key} className="flex gap-4 bg-pl-white p-5">
            <CardImage
              set="motm"
              managerKey={key}
              alt={`${nameOf(key)}, manager of the month`}
              className="aspect-square w-28 shrink-0 sm:w-36"
            />
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <p className="display truncate text-2xl leading-none text-pl-navy">{nameOf(key)}</p>
              <p className="mt-1.5 text-sm text-pl-muted">
                <span className="tnum font-semibold text-pl-navy">{month.totals[key]}</span> points across{' '}
                {month.gameweekIds.length} gameweeks
              </p>
              <p className="mt-2">
                <span className="display tnum text-2xl text-pl-green-ink">{money(month.potPerWinner)}</span>{' '}
                <span className="text-sm text-pl-muted">won</span>
              </p>
            </div>
          </div>
        ))}
      </div>

      {month.topPerformer && (
        <p className="border-t border-pl-border bg-pl-off px-5 py-3 text-sm text-pl-navy">
          Top performer: <strong className="font-semibold">{month.topPerformer.playerName}</strong> for{' '}
          {nameOf(month.topPerformer.managerKey)} —{' '}
          <span className="tnum font-semibold">{month.topPerformer.points}</span> pts
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
      <div className="bg-pl-white p-5">
        <p className="eyebrow text-pl-muted">{month ? `${month.shortLabel} pot so far` : 'This month’s pot'}</p>
        <p className="display tnum mt-2 text-4xl leading-none text-pl-navy">{money(month?.pot ?? 0)}</p>
        <p className="mt-2 text-sm text-pl-muted">
          {month
            ? `£5 per Koch across ${confirmed} confirmed gameweek${confirmed === 1 ? '' : 's'}. Winner takes all.`
            : 'Grows by £5 every time someone finishes bottom.'}
        </p>
      </div>
      <div className="bg-pl-white p-5">
        <p className="eyebrow text-pl-muted">Season prize</p>
        <p className="display tnum mt-2 text-4xl leading-none text-pl-navy">{money(prize)}</p>
        <p className="mt-2 text-sm text-pl-muted">
          {anyPlayed ? (
            <>
              Top of the table at season end. Currently{' '}
              <strong className="font-semibold text-pl-navy">{nameOf(leader.key)}</strong>.
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

  // The latest week with money attached to it. A finished-but-unchecked week
  // has no Koch yet, so it deliberately does not appear here.
  const settled = data.gameweeks.filter((gw) => gw.dataChecked)
  const latestKoch = settled.at(-1) ?? null

  const provisional = data.gameweeks.find((gw) => gw.finished && !gw.dataChecked) ?? null

  const settledMonths = data.months.filter((m) => m.settled)
  const latestMotm = settledMonths.at(-1) ?? null

  const currentMonth = data.months.find((m) => m.id === data.season.currentMonth) ?? null

  return (
    <>
      <Banner
        season={`Season ${data.league.season.replace('20', '').replace('/20', '/')}`}
        title="RSM Draft"
        subtitle="Eleven managers. £5 a week for finishing bottom. £110 for finishing top."
      />

      <PageBody>
        <div className="space-y-5">
          <DeadlineStrip gameweeks={data.gameweeks} />

          {provisional && (
            <p className="rounded-md border border-pl-border bg-pl-white px-4 py-3 text-sm text-pl-muted">
              Gameweek {provisional.id} has finished but FPL has not confirmed the final points yet. It shows as
              provisional and no money is attached until it does.
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
            <MotmCard month={latestMotm} nameOf={nameOf} />
          ) : (
            <AwaitingAward
              eyebrow="Manager of the month"
              title="No manager of the month yet"
              when="First award: end of August."
            />
          )}

          <MoneyStrip month={currentMonth} prize={data.season.seasonPrize} nameOf={nameOf} />

          {/* The compact table appears inline on Home for mobile, since the
              sidebar that normally holds it is not there. */}
          <section className="card p-4 lg:hidden">
            <MiniTable rows={data.season.rows} nameOf={nameOf} />
          </section>

          <DataFooter />
        </div>
      </PageBody>
    </>
  )
}
