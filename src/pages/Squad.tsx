import { useMemo } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Banner } from '../components/Banner'
import { GameweekSlider } from '../components/GameweekSlider'
import { ManagerAvatar } from '../components/Img'
import { PlayerCard, PlayerCardCompact } from '../components/PlayerCard'
import { PageBody } from '../components/Layout'
import { useData } from '../data'
import { useSquad } from '../lib/useSquad'
import type { Fixture, ManagerKey, Position, SquadPick, SquadPlayer } from '../types'

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
  if (mode === 'points') return String(pick?.points ?? 0)
  if (mode === 'pick') return `Pick ${pick?.pick ?? '?'}${pick?.sequence ? ` (${pick.sequence})` : ''}`
  return fixtureText
}

function subOf(entry: PitchPlayer): 'on' | 'off' | null {
  if (entry.pick?.subbedOn) return 'on'
  if (entry.pick?.subbedOff) return 'off'
  return null
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
  const gameweek =
    Number.isFinite(requested) && available.includes(requested) ? requested : fallback

  const { squad, fixtures, loading, error } = useSquad(gameweek)
  const gameweekMeta = data.gameweeks.find((gw) => gw.id === gameweek)

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
      <Banner
        season={isDraft ? '1st Draft' : `Gameweek ${gameweek}`}
        title={manager.teamName}
        subtitle={
          isDraft
            ? `${manager.displayName} · ${formation} · XI inferred from draft order, not an official lineup`
            : `${manager.displayName} · ${formation} · ${started ? 'points shown' : 'fixtures shown, the week has not kicked off'}`
        }
        aside={<ManagerAvatar managerKey={manager.key} size={64} className="h-16 w-16" />}
      />

      <PageBody>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-md border border-pl-border bg-pl-surface px-3 py-2 text-sm font-semibold text-pl-text hover:bg-pl-surface-2"
          >
            ← Back
          </button>
          <div className="flex flex-wrap gap-1.5">
            {data.league.managers.map((m) => (
              <Link
                key={m.key}
                to={`/managers/${m.key}/squad?gw=${gameweek}`}
                className={[
                  'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                  m.key === manager.key
                    ? 'border-pl-text bg-pl-text text-pl-bg'
                    : 'border-pl-border bg-transparent text-pl-text hover:bg-pl-surface-2',
                ].join(' ')}
              >
                {m.displayName}
              </Link>
            ))}
          </div>
        </div>

        <GameweekSlider
          className="mb-4"
          value={gameweek}
          min={firstGameweek}
          max={lastGameweek}
          onChange={setGameweek}
          playTo={lastGameweek > firstGameweek ? lastGameweek : undefined}
          labelFor={(gw) => (gw === 0 ? '1st Draft' : `GW${gw}`)}
        />

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
              <Pitch
                rows={ROWS.map((row) => byRow(row))}
                mode={mode}
                fixtureFor={fixtureFor}
              />

              {bench.length > 0 && <Bench bench={bench} mode={mode} fixtureFor={fixtureFor} />}
            </div>

            <p className="mt-3 text-xs leading-relaxed text-pl-muted">
              {isDraft ? (
                <>
                  These are the fifteen as drafted. Each card shows where the player went overall, then in brackets which of this manager's fifteen picks they were. A drafted squad
                  has no eleven, so this one is inferred: the highest drafted legal team, one keeper, at least
                  three defenders, two midfielders and a forward. It is not an official lineup.
                </>
              ) : (
                <>
                  {started
                    ? 'Points are shown because the gameweek has started. '
                    : 'Fixtures are shown because the gameweek has not started. '}
                  This is the squad as it stood that week. Squads change through waivers and trades.
                  {bench.some((b) => b.pick?.subbedOn) && ' The green arrow marks an automatic substitute.'}
                </>
              )}
            </p>
          </>
        )}
      </PageBody>
    </>
  )
}

function Pitch({
  rows,
  mode,
  fixtureFor,
}: {
  rows: PitchPlayer[][]
  mode: CardMode
  fixtureFor: (entry: PitchPlayer) => string
}) {
  // Full-bleed on mobile: PageBody's 16px each side would drop the fifth card
  // in a five-across row onto its own line.
  return (
    <div className="-mx-4 overflow-hidden sm:mx-0 sm:rounded-xl">
      {/* Rows are spaced by position with more air between the lines than a
          grid would give, so it reads as a formation. Each row centres its
          cards, so a row of two balances against a row of five. */}
      <div className="pitch px-1 pt-6 pb-8 sm:px-6 sm:pt-10 sm:pb-12">
        <div className="flex flex-col gap-7 sm:gap-10">
          {rows.map((row, i) => (
            <div key={i} className="flex flex-wrap items-start justify-center gap-x-1.5 gap-y-4 sm:gap-x-6">
              {row.map((entry) => (
                <PlayerCardResponsive key={entry.key} entry={entry} mode={mode} fixtureFor={fixtureFor} />
              ))}
            </div>
          ))}
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

function Bench({
  bench,
  mode,
  fixtureFor,
}: {
  bench: PitchPlayer[]
  mode: CardMode
  fixtureFor: (entry: PitchPlayer) => string
}) {
  return (
    /* A shelf, clearly not part of the playing surface: the card surface tone
       with a hairline border, and the cards a size down and a touch quieter
       so the XI reads as primary. Slots are labelled as FPL does: GK, then
       the outfield bench in substitution order. */
    <div className="-mx-4 mt-4 overflow-hidden border-y border-pl-border bg-pl-surface sm:mx-0 sm:rounded-xl sm:border">
      <p className="border-b border-pl-border px-4 py-2.5 text-[11px] font-semibold tracking-wider text-pl-muted uppercase">
        Bench
      </p>
      <div className="flex flex-wrap items-start justify-center gap-x-3 gap-y-4 px-2 py-5 sm:gap-x-8">
        {bench.map((entry) => (
          <div key={entry.key} className="flex flex-col items-center gap-1.5">
            <span className="text-[10px] font-bold tracking-wider text-pl-muted uppercase">{benchLabel(entry, bench)}</span>
            <PlayerCardResponsive entry={entry} mode={mode} fixtureFor={fixtureFor} bench />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Five cards across a pitch row at 375px is about 70px each, which only works
 * if the card drops to photo, surname and one number. Rather than shrinking the
 * desktop card until it breaks, both are rendered and CSS picks one.
 */
function PlayerCardResponsive({
  entry,
  mode,
  fixtureFor,
  bench = false,
}: {
  entry: PitchPlayer
  mode: CardMode
  fixtureFor: (entry: PitchPlayer) => string
  bench?: boolean
}) {
  const line = cardLine(entry, mode, fixtureFor(entry))
  const sub = subOf(entry)
  return (
    <>
      <span className="sm:hidden">
        <PlayerCardCompact player={entry.player} line={line} sub={sub} bench={bench} />
      </span>
      <span className="hidden sm:block">
        <PlayerCard player={entry.player} line={line} sub={sub} bench={bench} />
      </span>
    </>
  )
}
