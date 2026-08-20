import { Banner } from '../components/Banner'
import { CardImage } from '../components/Img'
import { PageBody } from '../components/Layout'
import { useData } from '../data'
import { money, monthShortLabel } from '../lib/season'
import honours from '../config/honours.json'
import type { HonoursEntry } from '../types'

/**
 * The payoff for having 33 graphics. By March this is a wall of them, and it is
 * the page people will actually send each other.
 */

function SectionHeading({ title, count }: { title: string; count?: number }) {
  return (
    <h2 className="eyebrow flex items-baseline gap-2 border-b-2 border-pl-cyan pb-1.5 text-pl-purple">
      {title}
      {count !== undefined && count > 0 && <span className="text-pl-muted">{count}</span>}
    </h2>
  )
}

function EmptySection({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-md border border-dashed border-pl-border bg-pl-white px-4 py-8 text-center">
      <p className="text-sm text-pl-muted">{children}</p>
    </div>
  )
}

export function Honours() {
  const { data } = useData()
  const nameOf = (key: string) => data.league.managers.find((m) => m.key === key)?.displayName ?? key

  const winners = honours as HonoursEntry[]

  // Newest first.
  const motm = [...data.months].filter((m) => m.settled).reverse()
  const kochWeeks = [...data.gameweeks].filter((gw) => gw.dataChecked && gw.kochKeys.length > 0).reverse()

  // Koches are grouped by month.
  const kochByMonth = kochWeeks.reduce<Record<string, typeof kochWeeks>>((acc, gw) => {
    ;(acc[gw.month] ??= []).push(gw)
    return acc
  }, {})

  return (
    <>
      <Banner
        season={`Season ${data.league.season.replace('20', '').replace('/20', '/')}`}
        title="Honours"
        subtitle="Champions, months won, and every week someone finished bottom."
      />

      <PageBody>
        <div className="space-y-8">
          <section>
            <SectionHeading title="Previous winners" />
            {winners.length === 0 ? (
              <EmptySection>No champions yet.</EmptySection>
            ) : (
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {winners.map((entry) => (
                  <figure key={entry.season} className="card overflow-hidden">
                    <CardImage
                      set="winner"
                      managerKey={entry.key}
                      alt={`${nameOf(entry.key)}, champion ${entry.season}`}
                      className="aspect-square w-full rounded-none"
                    />
                    <figcaption className="flex items-baseline justify-between gap-2 px-4 py-3">
                      <span className="display truncate text-xl text-pl-navy">{nameOf(entry.key)}</span>
                      <span className="tnum text-sm text-pl-muted">{entry.season}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </section>

          <section>
            <SectionHeading title="Manager of the month" count={motm.length} />
            {motm.length === 0 ? (
              <EmptySection>
                Nothing yet. The first month settles at the end of August, once every gameweek in it is confirmed.
              </EmptySection>
            ) : (
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {motm.flatMap((month) =>
                  month.winnerKeys.map((key) => (
                    <figure key={`${month.id}-${key}`} className="card overflow-hidden">
                      <CardImage
                        set="motm"
                        managerKey={key}
                        alt={`${nameOf(key)}, manager of the month for ${month.label}`}
                        className="aspect-square w-full rounded-none"
                      />
                      <figcaption className="px-4 py-3">
                        <p className="display truncate text-lg leading-none text-pl-navy">{nameOf(key)}</p>
                        <p className="mt-1 text-xs text-pl-muted">
                          {month.label} · {month.totals[key]} pts ·{' '}
                          <span className="font-semibold text-pl-green-ink">{money(month.potPerWinner)}</span>
                          {month.winnerKeys.length > 1 && ' (split)'}
                        </p>
                      </figcaption>
                    </figure>
                  ))
                )}
              </div>
            )}
          </section>

          <section>
            <SectionHeading title="Koch of the week" count={kochWeeks.reduce((n, gw) => n + gw.kochKeys.length, 0)} />
            {kochWeeks.length === 0 ? (
              <EmptySection>
                Nothing yet. The first Koch is awarded once gameweek 1 is confirmed.
              </EmptySection>
            ) : (
              <div className="mt-3 space-y-6">
                {Object.entries(kochByMonth).map(([monthId, weeks]) => (
                  <div key={monthId}>
                    <h3 className="text-sm font-semibold text-pl-muted">{monthShortLabel(monthId)}</h3>
                    <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {weeks.flatMap((gw) =>
                        gw.kochKeys.map((key) => (
                          <figure key={`${gw.id}-${key}`} className="card overflow-hidden">
                            <CardImage
                              set="koch"
                              managerKey={key}
                              alt={`${nameOf(key)}, Koch of the week for gameweek ${gw.id}`}
                              className="aspect-square w-full rounded-none"
                            />
                            <figcaption className="px-4 py-3">
                              <p className="display truncate text-lg leading-none text-pl-navy">{nameOf(key)}</p>
                              <p className="mt-1 text-xs text-pl-muted">
                                GW{gw.id} · {gw.scores[key]} pts ·{' '}
                                <span className="font-semibold text-pl-pink">−£5</span>
                                {gw.kochKeys.length > 1 && ` (${gw.kochKeys.length}-way tie)`}
                              </p>
                            </figcaption>
                          </figure>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </PageBody>
    </>
  )
}
