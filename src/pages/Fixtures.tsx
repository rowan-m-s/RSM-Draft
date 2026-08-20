import { Fragment, useState } from 'react'
import { Banner } from '../components/Banner'
import { GameweekSlider } from '../components/GameweekSlider'
import { ClubBadge, ManagerAvatar } from '../components/Img'
import { PageBody } from '../components/Layout'
import { useData } from '../data'
import {
  blankTeams,
  defaultGameweek,
  doubleMarkers,
  groupByDay,
  involvement,
  kickoffTime,
  matchState,
  matchesIn,
  unscheduled,
} from '../lib/fixtures'
import { formatLondon } from '../lib/season'
import { useFixtures } from '../lib/useSquad'
import type { Match, Player, Team } from '../types'

/**
 * The real Premier League fixtures, one gameweek at a time, with the thing a
 * fixture list anywhere else cannot tell you: how many players owned in this
 * league are in each match, and whose they are. Addendum 03, Part B.
 */

const FIRST = 1
const LAST = 38

function OwnedChip({ players }: { players: Player[] }) {
  if (players.length === 0) return <span className="text-xs text-pl-muted">0</span>
  return (
    <span className="rounded-full bg-pl-surface-2 px-2 py-0.5 text-xs font-semibold text-pl-text">{players.length}</span>
  )
}

/** Centre of the row: kickoff, live score, or final score. */
function Middle({ match }: { match: Match }) {
  const state = matchState(match)
  if (state === 'unscheduled') return <span className="text-sm text-pl-muted">TBC</span>
  if (state === 'upcoming') return <span className="tnum text-sm text-pl-text">{kickoffTime(match.kickoff!)}</span>
  return (
    <span className="flex flex-col items-center leading-none">
      <span className="display tnum text-xl text-pl-text">
        {match.homeScore ?? 0}
        <span className="mx-1 text-pl-muted">–</span>
        {match.awayScore ?? 0}
      </span>
      {state === 'live' && <span className="eyebrow mt-1 text-pl-green">Live</span>}
      {state === 'finished' && <span className="mt-1 text-[10px] text-pl-muted uppercase">FT</span>}
    </span>
  )
}

function Side({
  team,
  align,
  double,
}: {
  team: Team
  align: 'left' | 'right'
  double?: { n: number; of: number }
}) {
  const badge = <ClubBadge clubCode={team.code} club={team.name} size={22} />
  const name = (
    <span className="min-w-0">
      <span className="block truncate text-sm font-semibold text-pl-text">
        <span className="sm:hidden">{team.shortName}</span>
        <span className="hidden sm:inline">{team.name}</span>
      </span>
      {double && <span className="block text-[10px] text-pl-muted">{double.n === 1 ? '1st' : '2nd'} of {double.of} this week</span>}
    </span>
  )
  return align === 'left' ? (
    <span className="flex min-w-0 items-center gap-2">
      {badge}
      {name}
    </span>
  ) : (
    <span className="flex min-w-0 items-center justify-end gap-2 text-right">
      {name}
      {badge}
    </span>
  )
}

function OwnedList({ players, nameOf, align }: { players: Player[]; nameOf: (k: string) => string; align: 'left' | 'right' }) {
  if (players.length === 0) return <p className="text-xs text-pl-muted">None owned</p>
  return (
    <ul className={`space-y-1.5 ${align === 'right' ? 'sm:text-right' : ''}`}>
      {players.map((p) => (
        <li key={p.id} className={`flex items-center gap-2 ${align === 'right' ? 'sm:flex-row-reverse' : ''}`}>
          <ManagerAvatar managerKey={p.owner!} size={20} />
          <span className="min-w-0 truncate text-sm text-pl-text">
            {p.name} <span className="text-pl-muted">· {nameOf(p.owner!)}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function MatchRow({
  match,
  teamOf,
  owned,
  nameOf,
  doubles,
}: {
  match: Match
  teamOf: (id: number) => Team
  owned: Player[]
  nameOf: (k: string) => string
  doubles: Map<number, { n: number; of: number }> | undefined
}) {
  const [open, setOpen] = useState(false)
  const who = involvement(match, owned)
  const total = who.home.length + who.away.length
  const home = teamOf(match.home)
  const away = teamOf(match.away)

  return (
    <li className="border-b border-pl-border last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="block w-full px-4 py-3 text-left hover:bg-pl-surface-2"
      >
        {/* Line one: clubs and the score or time. */}
        <span className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <Side team={home} align="left" double={doubles?.get(match.home)} />
          <span className="w-16 text-center">
            <Middle match={match} />
          </span>
          <Side team={away} align="right" double={doubles?.get(match.away)} />
        </span>
        {/* Line two: who we own in it. */}
        <span className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xs text-pl-muted">
          <span className="flex items-center gap-1.5">
            <OwnedChip players={who.home} />
            <span className="hidden sm:inline">owned</span>
          </span>
          <span className="w-16 text-center">{total === 0 ? 'nobody owned' : `${total} owned`}</span>
          <span className="flex items-center justify-end gap-1.5">
            <span className="hidden sm:inline">owned</span>
            <OwnedChip players={who.away} />
          </span>
        </span>
      </button>
      {open && (
        <div className="grid gap-4 border-t border-pl-border bg-pl-bg/40 px-4 py-3 sm:grid-cols-2">
          <OwnedList players={who.home} nameOf={nameOf} align="left" />
          <OwnedList players={who.away} nameOf={nameOf} align="right" />
        </div>
      )}
    </li>
  )
}

export function Fixtures() {
  const { data } = useData()
  const { fixtures, loading, error } = useFixtures()
  const [gameweek, setGameweek] = useState(() => defaultGameweek(data.gameweeks))
  const nameOf = (key: string) => data.league.managers.find((m) => m.key === key)?.displayName ?? key

  const season = `Season ${data.league.season.replace('20', '').replace('/20', '/')}`

  if (error) {
    return (
      <>
        <Banner season={season} title="Fixtures" subtitle="Every Premier League match, and who we own in it." />
        <PageBody>
          <div className="card p-6">
            <p className="eyebrow text-pl-amber">Fixtures unavailable</p>
            <p className="mt-2 text-sm text-pl-muted">{error}</p>
          </div>
        </PageBody>
      </>
    )
  }

  const matches = fixtures?.matches ?? []
  const teams = fixtures?.teams ?? []
  const teamOf = (id: number) =>
    teams.find((t) => t.id === id) ?? { id, name: `Team ${id}`, shortName: '???', code: 0 }

  const inWeek = matchesIn(matches, gameweek)
  const days = groupByDay(inWeek)
  const blanks = blankTeams(matches, teams, gameweek)
  const doubles = doubleMarkers(matches, gameweek)
  const postponed = unscheduled(matches)
  const owned = data.players.owned

  const meta = data.gameweeks.find((gw) => gw.id === gameweek)

  return (
    <>
      <Banner
        season={season}
        title="Fixtures"
        subtitle={
          meta
            ? `Gameweek ${gameweek} · deadline ${formatLondon(meta.deadlineUtc)}`
            : 'Every Premier League match, and who we own in it.'
        }
      />

      <PageBody>
        <GameweekSlider className="mb-5" value={gameweek} min={FIRST} max={LAST} onChange={setGameweek} />

        {loading && !fixtures ? (
          <div className="card p-10 text-center text-sm text-pl-muted">Loading…</div>
        ) : (
          <div className="space-y-5">
            {blanks.length > 0 && teams.length > 0 && (
              <div className="card px-4 py-3">
                <p className="eyebrow text-pl-muted">Blank gameweek</p>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-pl-text">
                  {blanks.map((t) => (
                    <span key={t.id} className="flex items-center gap-1.5">
                      <ClubBadge clubCode={t.code} club={t.name} size={16} />
                      {t.name}
                    </span>
                  ))}
                </p>
                <p className="mt-1.5 text-xs text-pl-muted">
                  {blanks.length === 1 ? 'This club has' : 'These clubs have'} no fixture in gameweek {gameweek}.
                  Their players score nothing this week.
                </p>
              </div>
            )}

            {inWeek.length === 0 ? (
              <div className="card p-8 text-center">
                <p className="display text-xl text-pl-text">No fixtures in gameweek {gameweek}</p>
                <p className="mt-1.5 text-sm text-pl-muted">Nothing is scheduled for this week yet.</p>
              </div>
            ) : (
              days.map((day) => (
                <section key={day.day ?? 'tbc'} className="card overflow-hidden">
                  <h2 className="border-b border-pl-border px-4 py-2.5 text-[11px] font-semibold tracking-wider text-pl-muted uppercase">
                    {day.heading}
                  </h2>
                  <ul>
                    {day.matches.map((m) => (
                      <MatchRow
                        key={m.id}
                        match={m}
                        teamOf={teamOf}
                        owned={owned}
                        nameOf={nameOf}
                        doubles={doubles.get(m.id)}
                      />
                    ))}
                  </ul>
                </section>
              ))
            )}

            {postponed.length > 0 && (
              <section className="card overflow-hidden">
                <h2 className="border-b border-pl-border px-4 py-2.5 text-[11px] font-semibold tracking-wider text-pl-muted uppercase">
                  Postponed, awaiting a new date
                </h2>
                <ul>
                  {postponed.map((m) => (
                    <Fragment key={m.id}>
                      <MatchRow match={m} teamOf={teamOf} owned={owned} nameOf={nameOf} doubles={undefined} />
                    </Fragment>
                  ))}
                </ul>
              </section>
            )}

            <p className="text-xs leading-relaxed text-pl-muted">
              Kickoff times are UK time. Owned counts are against current squads, so a past week shows who owns
              those players now, not who owned them then.
            </p>
          </div>
        )}
      </PageBody>
    </>
  )
}
