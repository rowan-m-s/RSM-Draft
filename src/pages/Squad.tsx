import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Banner } from '../components/Banner'
import { Breakdown, pts } from '../components/Breakdown'
import { GameweekSlider } from '../components/GameweekSlider'
import { ManagerAvatar } from '../components/Img'
import { PlayerCard, PlayerCardCompact } from '../components/PlayerCard'
import { PageBody } from '../components/Layout'
import { useData } from '../data'
import { gameweekPoints } from '../lib/season'
import { usePoints, useSquad } from '../lib/useSquad'
import type { Fixture, ManagerKey, PointsComponent, Position, SquadPick, SquadPlayer } from '../types'

const ROWS: Position[] = ['GKP', 'DEF', 'MID', 'FWD']

/** What the card's bottom line says. Never a user choice; the week decides. */
type CardMode = 'points' | 'fixture' | 'pick'

interface PitchPlayer {
  key: number
  player: SquadPlayer
  pick: SquadPick | null
}

function fixtureLabel(fixtures: Fixture[] | undefined, shortNameOf: (id: number) => string): string {
  if (!fixtures || fixtures.length === 0) return 'No fixture'
  return fixtures.map((f) => `${shortNameOf(f.opponent)} (${f.home ? 'H' : 'A'})`).join(' · ')
}

/**
 * What the card's info band says for this player in this view.
 *
 * On the draft, "Pick 3 (1)": where the player went in the room, then in
 * brackets how highly this manager rated them, their first to fifteenth.
 */
function cardLine(entry: PitchPlayer, mode: CardMode, fixtureText: string): string {
  const { pick } = entry
  if (mode === 'points') return pts(pick?.points ?? 0)
  if (mode === 'pick') return `Pick ${pick?.pick ?? '?'}${pick?.sequence ? ` (${pick.sequence})` : ''}`
  return fixtureText
}

function subOf(entry: PitchPlayer): 'on' | 'off' | null {
  if (entry.pick?.subbedOn) return 'on'
  if (entry.pick?.subbedOff) return 'off'
  return null
}

/**
 * The manager's points for the gameweek on the pitch. One large number;
 * beneath it, quietly, what the bench scored and where the XI total ranks
 * among the eleven, which is what decides the £5.
 *
 * Hidden for the draft, where no points exist: a zero there would read as
 * a real score. A week in play is marked provisional, as the league table
 * marks it. A confirmed week in which this manager was Koch takes the
 * Koch colour, as the league table does.
 */
export function PointsStrip({
  squads,
  managerKey,
  gameweek,
  started,
  confirmed,
  koch,
}: {
  squads: Record<string, { starter: boolean; points: number }[]>
  managerKey: string
  gameweek: number
  started: boolean
  confirmed: boolean
  koch: boolean
}) {
  const points = gameweekPoints(squads, managerKey)
  if (!points || !started) return null
  const provisional = !confirmed
  const tone = koch ? 'text-pl-pink' : 'text-pl-text'

  return (
    <section
      className={`card mb-3 flex flex-col items-center gap-1.5 px-4 py-3 text-center sm:mb-4 sm:px-5 ${provisional ? 'opacity-90' : ''}`}
    >
      <span className={`display tnum text-4xl leading-none sm:text-5xl ${tone}`}>{points.xi}</span>
      <p className="flex items-center justify-center gap-2 text-sm text-pl-muted">
        <span>
          GW{gameweek} points
          {provisional && <span className="text-pl-text"> · provisional</span>}
        </span>
        {koch && (
          <span className="rounded bg-pl-pink px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-pl-bg uppercase">
            Koch
          </span>
        )}
      </p>
    </section>
  )
}

export function Squad() {
  const { key } = useParams<{ key: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { data } = useData()

  const manager = data.league.managers.find((m) => m.key === key)

  /* Only gameweeks that actually have a squad are offered. Picks do not exist
     in Draft until a deadline passes, so a future week has nothing to render
     and showing an empty pitch would be worse than not offering it. GW0, the
     initial draft, is always there. */
  const available = data.league.availableSquads?.length ? data.league.availableSquads : [0]
  const firstGameweek = available[0]
  const lastGameweek = available[available.length - 1]

  // Defaults to the latest week with points, which until GW1 completes is GW0.
  const withPoints = data.gameweeks.filter((gw) => gw.finished).map((gw) => gw.id)
  const fallback = available.filter((gw) => withPoints.includes(gw)).at(-1) ?? lastGameweek
  const requested = Number(params.get('gw'))
  const gameweek = Number.isFinite(requested) && available.includes(requested) ? requested : fallback

  const { squad, fixtures, loading, error } = useSquad(gameweek)
  const gameweekMeta = data.gameweeks.find((gw) => gw.id === gameweek)
  const { points: pointsFile } = usePoints(gameweek)
  // One card open at a time; a new week closes it.
  const [openKey, setOpenKey] = useState<string | null>(null)
  const open = openKey?.startsWith(`${gameweek}:`) ? Number(openKey.slice(openKey.indexOf(':') + 1)) : null

  /** teamId → short name, for rendering an opponent. */
  const shortNameOf = useMemo(() => {
    const names = new Map<number, string>()
    for (const player of [...data.players.owned, ...data.players.freeAgents]) {
      names.set(player.teamId, player.clubShort)
    }
    for (const player of Object.values(squad?.players ?? {})) names.set(player.teamId, player.clubShort)
    return (teamId: number) => names.get(teamId) ?? '???'
  }, [data.players, squad])

  if (!manager) {
    return (
      <PageBody>
        <div className="card p-8 text-center">
          <p className="display text-xl text-pl-text">No such manager</p>
          <Link to="/managers" className="mt-2 inline-block text-sm text-pl-cyan underline">
            Back to Managers
          </Link>
        </div>
      </PageBody>
    )
  }

  /* What the bottom line of each card says. Every selectable gameweek has a
     squad file — picks exist once a deadline passes, and GW0 is the draft —
     so there is no pre-deadline "current squad" view. Addendum 02 §6. */
  const isDraft = gameweek === 0
  const started = squad?.started ?? false
  const mode: CardMode = isDraft ? 'pick' : started ? 'points' : 'fixture'

  const asPitchPlayer = (pick: SquadPick): PitchPlayer | null => {
    const player = squad?.players[String(pick.element)]
    return player ? { key: pick.element, player, pick } : null
  }

  const picks = squad?.squads[key as ManagerKey] ?? []
  const starters = picks
    .filter((p) => p.starter)
    .map(asPitchPlayer)
    .filter((x): x is PitchPlayer => x !== null)
  const bench = picks
    .filter((p) => !p.starter)
    .sort((a, b) => a.position - b.position)
    .map(asPitchPlayer)
    .filter((x): x is PitchPlayer => x !== null)

  const byRow = (row: Position) => starters.filter((entry) => entry.player.position === row)
  const formation = `${byRow('DEF').length}-${byRow('MID').length}-${byRow('FWD').length}`

  const fixtureFor = (entry: PitchPlayer) =>
    fixtureLabel(fixtures?.byEvent?.[String(gameweek)]?.[String(entry.player.teamId)], shortNameOf)

  /* Where a player's points came from, per fixture: a double gameweek is two
     entries, each that match's own contribution. Null until the week has
     started, when cards show fixtures rather than points. */
  const breakdownFor = (entry: PitchPlayer): FixtureBreakdown[] | null => {
    if (mode !== 'points' || !pointsFile) return null
    const out: FixtureBreakdown[] = []
    for (const [fixtureId, byElement] of Object.entries(pointsFile.byFixture)) {
      const part = byElement[String(entry.key)]
      if (!part) continue
      const match = fixtures?.matches.find((m) => m.id === Number(fixtureId))
      const opponent = match ? (match.home === entry.player.teamId ? match.away : match.home) : null
      const label =
        match && opponent !== null
          ? `${shortNameOf(opponent)} (${match.home === entry.player.teamId ? 'H' : 'A'})`
          : null
      out.push({ fixtureId, label, total: part.total, components: part.components })
    }
    return out
  }
  const toggle = (entry: PitchPlayer) => setOpenKey(open === entry.key ? null : `${gameweek}:${entry.key}`)
  const breakdownProps = { mode, fixtureFor, breakdownFor, open, toggle, confirmed: squad?.dataChecked ?? false }

  const setGameweek = (wanted: number) => {
    // The slider is a range input, so it can land on a week between two
    // available ones if a week's picks were ever skipped. Snap to the nearest
    // week that has a squad rather than showing nothing.
    const next = available.reduce((best, gw) => (Math.abs(gw - wanted) < Math.abs(best - wanted) ? gw : best))
    // Same page, different week. `replace` keeps the back button useful, and
    // `preventScrollReset` stops the scroll position being thrown away mid
    // drag. Routed through navigate() rather than the useSearchParams setter
    // because that setter does not forward the flag.
    navigate(`?gw=${next}`, { replace: true, preventScrollReset: true })
  }

  return (
    <>
      {/* Manager, formation and the caveat all earn their place, but not at
          full length on a phone: the short form carries the long one as a
          tooltip, and the long form shows from sm up. */}
      <Banner
        season={isDraft ? '1st Draft' : `Gameweek ${gameweek}`}
        title={manager.teamName}
        subtitle={
          <>
            {manager.displayName} · {formation} ·{' '}
            <span
              className="sm:hidden"
              title={isDraft ? 'XI inferred from draft order, not an official lineup' : undefined}
            >
              {isDraft ? 'Inferred XI' : started ? 'Points' : 'Fixtures'}
            </span>
            <span className="hidden sm:inline">
              {isDraft
                ? 'XI inferred from draft order, not an official lineup'
                : started
                  ? 'points shown'
                  : 'fixtures shown, the week has not kicked off'}
            </span>
          </>
        }
        aside={<ManagerAvatar managerKey={manager.key} size={64} className="h-12 w-12 sm:h-16 sm:w-16" />}
      />

      <PageBody>
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 sm:mb-4 sm:gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="rounded-md border border-pl-border bg-pl-surface px-2.5 py-1.5 text-sm font-semibold text-pl-text hover:bg-pl-surface-2 sm:px-3 sm:py-2"
          >
            ←<span className="hidden sm:inline"> Back</span>
          </button>
          {/* Squad to squad keeps the scroll position: people flick between
              teams and being sent to the top each time is a nuisance. These
              pills are the only squad-to-squad route, so the exception lives
              here. Arriving from anywhere else still opens at the top, and
              back still restores (Addendum 02 §5). */}
          {/* Eleven short names fit two rows at 375px once the padding and
              type come down a step; a scroller would hide names people do
              not know are there. The pills share the Back button's row rather
              than wrapping as a group beneath it. */}
          {data.league.managers.map((m) => (
            <Link
              key={m.key}
              to={`/managers/${m.key}/squad?gw=${gameweek}`}
              preventScrollReset
              className={[
                'rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors sm:px-3 sm:py-1.5 sm:text-xs',
                m.key === manager.key
                  ? 'border-pl-text bg-pl-text text-pl-bg'
                  : 'border-pl-border bg-transparent text-pl-text hover:bg-pl-surface-2',
              ].join(' ')}
            >
              {m.displayName}
            </Link>
          ))}
        </div>

        <GameweekSlider
          className="mb-3 sm:mb-4"
          value={gameweek}
          min={firstGameweek}
          max={lastGameweek}
          onChange={setGameweek}
          playTo={lastGameweek > firstGameweek ? lastGameweek : undefined}
          labelFor={(gw) => (gw === 0 ? '1st Draft' : `GW${gw}`)}
        />

        {squad && !isDraft && (
          <PointsStrip
            squads={squad.squads}
            managerKey={manager.key}
            gameweek={gameweek}
            started={started}
            confirmed={squad.dataChecked}
            koch={Boolean(squad.dataChecked && gameweekMeta?.kochKeys.includes(manager.key))}
          />
        )}

        {error && (
          <div className="card mb-4 p-4">
            <p className="text-sm text-pl-amber">Couldn’t load that gameweek: {error}</p>
          </div>
        )}

        {starters.length === 0 && loading ? (
          <div className="card p-10 text-center text-sm text-pl-muted">Loading…</div>
        ) : starters.length === 0 ? (
          <div className="card p-10 text-center">
            <p className="display text-xl text-pl-text">Nothing to show for gameweek {gameweek}</p>
            <p className="mt-1.5 text-sm text-pl-muted">
              {gameweekMeta && new Date(gameweekMeta.deadlineUtc).getTime() > Date.now()
                ? 'Squads lock at the deadline. Until then there is no eleven to show.'
                : 'No squad was recorded for this gameweek.'}
            </p>
          </div>
        ) : (
          <>
            {/*
              Kept on screen while the next gameweek loads rather than being
              swapped for a spinner. Replacing it collapses the page to a
              fraction of its height, and the browser clamps the scroll
              position to fit, so a slider drag threw the reader back to the
              top. Nothing was scrolling; the page was simply getting shorter.
            */}
            <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
              <Pitch rows={ROWS.map((row) => byRow(row))} {...breakdownProps} />

              {bench.length > 0 && <Bench bench={bench} {...breakdownProps} />}
            </div>

            <p className="mt-3 text-xs leading-relaxed text-pl-muted">
              {isDraft ? (
                <>
                  These are the fifteen as drafted. Each card shows where the player went overall, then in brackets
                  which of this manager's fifteen picks they were. A drafted squad has no eleven, so this one is
                  inferred: the highest drafted legal team, one keeper, at least three defenders, two midfielders and a
                  forward. It is not an official lineup.
                </>
              ) : (
                <>
                  {started
                    ? 'Points are shown because the gameweek has started. '
                    : 'Fixtures are shown because the gameweek has not started. '}
                  This is the squad as it stood that week. Squads change through waivers and trades.
                  {started && ' Tap a card for where the points came from.'}
                  {picks.some((p) => p.subbedOn) &&
                    ' SUB marks an automatic substitution, as Draft applied it after the final whistle.'}
                </>
              )}
            </p>
          </>
        )}
      </PageBody>
    </>
  )
}

interface FixtureBreakdown {
  fixtureId: string
  /** "ARS (H)", or null if the match is not known. */
  label: string | null
  total: number
  components: PointsComponent[]
}

interface CardProps {
  mode: CardMode
  fixtureFor: (entry: PitchPlayer) => string
  breakdownFor: (entry: PitchPlayer) => FixtureBreakdown[] | null
  /** The element whose breakdown is open, if any. */
  open: number | null
  toggle: (entry: PitchPlayer) => void
  confirmed: boolean
}

/**
 * The breakdown for the open card in a row, shown as a panel beneath the
 * row rather than a popover: a popover has nowhere to go on a 375px pitch
 * without covering the next row, and the rows are already spaced so the
 * panel reads as belonging to the one above it.
 */
function RowBreakdown({
  entry,
  parts,
  confirmed,
  above = false,
}: {
  entry: PitchPlayer
  parts: FixtureBreakdown[]
  confirmed: boolean
  /** Open upwards: the pitch clips at its edge, so the bottom row has no room below. */
  above?: boolean
}) {
  const total = parts.reduce((n, p) => n + p.total, 0)
  // Floats over the next row rather than pushing it down: the pitch keeps
  // its shape, and closing the panel moves nothing.
  return (
    <div
      className={`absolute inset-x-2 z-10 mx-auto w-auto max-w-sm rounded-md border border-pl-border bg-pl-bg/95 px-3 py-2 shadow-xl backdrop-blur-sm ${
        above ? 'bottom-full mb-2' : 'top-full mt-2'
      }`}
    >
      <p className="flex items-baseline justify-between gap-4 text-sm">
        <span className="font-semibold text-pl-text">{entry.player.name}</span>
        <span className="tnum font-bold text-pl-text">{pts(total)}</span>
      </p>
      {parts.length === 0 && <p className="mt-1 text-xs text-pl-muted">Did not play</p>}
      {parts.map((part) => (
        <div key={part.fixtureId} className="mt-1.5">
          {parts.length > 1 && (
            <p className="flex items-baseline justify-between text-[11px] text-pl-muted">
              <span>{part.label ?? 'Fixture'}</span>
              <span className="tnum">{pts(part.total)}</span>
            </p>
          )}
          <Breakdown components={part.components} confirmed={confirmed} />
        </div>
      ))}
    </div>
  )
}

function Pitch({ rows, ...card }: { rows: PitchPlayer[][] } & CardProps) {
  // Full-bleed on mobile: PageBody's 16px each side would drop the fifth card
  // in a five-across row onto its own line.
  return (
    <div className="-mx-4 sm:mx-0 sm:rounded-xl">
      {/* Rows are spaced by position with more air between the lines than a
          grid would give, so it reads as a formation. Each row centres its
          cards, so a row of two balances against a row of five. */}
      <div className="pitch px-1 pt-6 pb-8 sm:px-6 sm:pt-10 sm:pb-12">
        <div className="flex flex-col gap-7 sm:gap-10">
          {rows.map((row, i) => {
            const opened = row.find((entry) => entry.key === card.open)
            const parts = opened ? card.breakdownFor(opened) : null
            return (
              <div key={i} className="relative flex flex-wrap items-start justify-center gap-x-1.5 gap-y-4 sm:gap-x-6">
                {row.map((entry) => (
                  <PlayerCardResponsive key={entry.key} entry={entry} {...card} />
                ))}
                {opened && parts && (
                  <RowBreakdown entry={opened} parts={parts} confirmed={card.confirmed} above={i === rows.length - 1} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * FPL labels the bench GK, 1, 2, 3 — the keeper is not in the substitution
 * order because an outfielder can never replace him.
 */
function benchLabel(entry: PitchPlayer, bench: PitchPlayer[]): string {
  if (entry.player.position === 'GKP') return 'GK'
  const outfield = bench.filter((b) => b.player.position !== 'GKP')
  return String(outfield.indexOf(entry) + 1)
}

function Bench({ bench, ...card }: { bench: PitchPlayer[] } & CardProps) {
  const opened = bench.find((entry) => entry.key === card.open)
  const parts = opened ? card.breakdownFor(opened) : null
  return (
    /* A shelf, clearly not part of the playing surface: the card surface tone
       with a hairline border, and the cards a size down and a touch quieter
       so the XI reads as primary. Slots are labelled as FPL does: GK, then
       the outfield bench in substitution order. */
    <div className="-mx-4 mt-4 border-y border-pl-border bg-pl-surface sm:mx-0 sm:rounded-xl sm:border">
      <p className="border-b border-pl-border px-4 py-2.5 text-[11px] font-semibold tracking-wider text-pl-muted uppercase">
        Bench
      </p>
      <div className="relative flex flex-wrap items-start justify-center gap-x-3 gap-y-4 px-2 py-5 sm:gap-x-8">
        {bench.map((entry) => (
          <div key={entry.key} className="flex flex-col items-center gap-1.5">
            <span className="text-[10px] font-bold tracking-wider text-pl-muted uppercase">
              {benchLabel(entry, bench)}
            </span>
            <PlayerCardResponsive entry={entry} {...card} bench />
          </div>
        ))}
        {opened && parts && <RowBreakdown entry={opened} parts={parts} confirmed={card.confirmed} />}
      </div>
    </div>
  )
}

/**
 * Five cards across a pitch row at 375px is about 70px each, which only works
 * if the card drops to photo, surname and one number. Rather than shrinking the
 * desktop card until it breaks, both are rendered and CSS picks one.
 *
 * Once the week has started the card is a button that opens its breakdown.
 */
function PlayerCardResponsive({
  entry,
  mode,
  fixtureFor,
  open,
  toggle,
  bench = false,
}: CardProps & { entry: PitchPlayer; bench?: boolean }) {
  const line = cardLine(entry, mode, fixtureFor(entry))
  const sub = subOf(entry)
  const cards = (
    <>
      <span className="sm:hidden">
        <PlayerCardCompact player={entry.player} line={line} sub={sub} bench={bench} />
      </span>
      <span className="hidden sm:block">
        <PlayerCard player={entry.player} line={line} sub={sub} bench={bench} />
      </span>
    </>
  )
  if (mode !== 'points') return cards
  const isOpen = open === entry.key
  return (
    <button
      type="button"
      onClick={() => toggle(entry)}
      aria-expanded={isOpen}
      aria-label={`${entry.player.name}, ${line}, ${isOpen ? 'hide' : 'show'} breakdown`}
      className={`rounded-md text-left transition-[outline,transform] focus-visible:outline-2 focus-visible:outline-pl-cyan ${
        isOpen ? 'outline-2 outline-pl-cyan' : ''
      }`}
    >
      {cards}
    </button>
  )
}
