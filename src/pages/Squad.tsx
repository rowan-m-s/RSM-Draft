import { useMemo } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Banner } from '../components/Banner'
import { GameweekSlider } from '../components/GameweekSlider'
import { ManagerAvatar, PlayerPhoto } from '../components/Img'
import { PageBody } from '../components/Layout'
import { PlayerFlag } from '../components/PlayerFlag'
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
 * One player on the pitch.
 *
 * Follows the FPL layout: photo, then the surname on a dark band, then one
 * line on a lighter band beneath. FPL puts a price in that slot and Draft has
 * no prices, so it carries the points or the fixture instead.
 */
function PlayerCard({
  entry,
  mode,
  fixtureText,
  compact,
}: {
  entry: PitchPlayer
  mode: CardMode
  fixtureText: string
  compact: boolean
}) {
  const { player, pick } = entry
  const line =
    mode === 'points'
      ? String(pick?.points ?? 0)
      : mode === 'pick'
        ? `Pick ${pick?.pick ?? '?'}`
        : fixtureText

  return (
    <div className={`flex flex-col items-center ${compact ? 'w-[64px]' : 'w-[104px]'}`}>
      <div className="relative">
        <PlayerPhoto
          photoCode={player.photoCode}
          name={player.name}
          size={compact ? 'tiny' : 'small'}
          className={`${compact ? 'h-11 w-11' : 'h-16 w-16'} rounded-full bg-white/85 object-cover object-top ring-1 ring-black/10`}
        />
        {/* Availability flag, tucked into the corner as FPL draws it. */}
        <PlayerFlag player={player} size={compact ? 12 : 15} className="absolute -top-0.5 -right-0.5" />
        {pick?.subbedOn && (
          <span
            title="Came on as an automatic substitute"
            className="absolute -bottom-1 -left-1 rounded-full bg-pl-green-ink px-1 text-[9px] font-bold text-white"
          >
            ▲
          </span>
        )}
        {pick?.subbedOff && (
          <span
            title="Replaced by an automatic substitute"
            className="absolute -bottom-1 -left-1 rounded-full bg-pl-muted px-1 text-[9px] font-bold text-white"
          >
            ▼
          </span>
        )}
      </div>

      <p
        className={`mt-1 w-full truncate rounded-t bg-pl-purple px-1 text-center font-semibold text-pl-white ${
          compact ? 'text-[10px] leading-4' : 'text-xs leading-5'
        }`}
        title={player.name}
      >
        {player.name}
      </p>
      <p
        className={`w-full truncate rounded-b bg-white/90 px-1 text-center font-semibold text-pl-navy ${
          compact ? 'text-[10px] leading-4' : 'text-xs leading-5'
        }`}
        title={line}
      >
        {line}
      </p>
    </div>
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
          <p className="display text-xl text-pl-navy">No such manager</p>
          <Link to="/managers" className="mt-2 inline-block text-sm text-pl-cyan-ink underline">
            Back to Managers
          </Link>
        </div>
      </PageBody>
    )
  }

  /* Which players to show, and what the bottom line says.

     A gameweek whose deadline has passed has real picks, so the pitch is that
     week's actual eleven. Before the deadline there are no picks at all — the
     XI is not decided — so the currently owned fifteen are shown instead,
     grouped by position and clearly marked as not yet locked. */
  const hasPicks = Boolean(squad)
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

  const setGameweek = (next: number) => {
    // Same page, different week. `replace` keeps the back button useful, and
    // `preventScrollReset` stops the scroll position being thrown away mid
    // drag. Routed through navigate() rather than the useSearchParams setter
    // because that setter does not forward the flag.
    navigate(`?gw=${next}`, { replace: true, preventScrollReset: true })
  }

  return (
    <>
      <Banner
        season={isDraft ? 'First Draft' : `Gameweek ${gameweek}`}
        title={`${manager.displayName}'s squad`}
        subtitle={
          isDraft
            ? `${formation} · XI inferred from draft order, not an official lineup`
            : `${formation} · ${started ? 'points shown' : 'fixtures shown, the week has not kicked off'}`
        }
        aside={<ManagerAvatar managerKey={manager.key} size={64} className="h-16 w-16" />}
      />

      <PageBody>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-md border border-pl-border bg-pl-white px-3 py-2 text-sm font-semibold text-pl-navy hover:bg-pl-off"
          >
            ← Back
          </button>
          <div className="flex flex-wrap gap-1.5">
            {data.league.managers.map((m) => (
              <Link
                key={m.key}
                to={`/managers/${m.key}/squad?gw=${gameweek}`}
                className={[
                  'rounded px-2.5 py-1.5 text-xs font-semibold',
                  m.key === manager.key
                    ? 'bg-pl-purple text-pl-white'
                    : 'border border-pl-border bg-pl-white text-pl-navy hover:bg-pl-off',
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
          labelFor={(gw) => (gw === 0 ? 'First Draft' : `GW${gw}`)}
        />

        {error && (
          <div className="card mb-4 p-4">
            <p className="text-sm text-pl-pink">Couldn’t load that gameweek: {error}</p>
          </div>
        )}

        {starters.length === 0 && loading ? (
          <div className="card p-10 text-center text-sm text-pl-muted">Loading…</div>
        ) : starters.length === 0 ? (
          <div className="card p-10 text-center">
            <p className="display text-xl text-pl-navy">Nothing to show for gameweek {gameweek}</p>
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
                locked={hasPicks}
              />

              {bench.length > 0 && <Bench bench={bench} mode={mode} fixtureFor={fixtureFor} />}
            </div>

            <p className="mt-3 text-xs leading-relaxed text-pl-muted">
              {isDraft ? (
                <>
                  These are the fifteen as drafted, with the overall pick number on each card. A drafted squad
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
  locked,
}: {
  rows: PitchPlayer[][]
  mode: CardMode
  fixtureFor: (entry: PitchPlayer) => string
  locked: boolean
}) {
  // Full-bleed on mobile: PageBody's 16px each side would drop the fifth card
  // in a five-across row onto its own line.
  return (
    <div className="-mx-4 overflow-hidden border-y border-pl-border sm:mx-0 sm:rounded-lg sm:border">
      <div className="pitch relative px-1.5 py-5 sm:px-4 sm:py-7">
        {!locked && (
          <p className="mb-3 text-center text-[11px] font-semibold tracking-wider text-white/90 uppercase">
            Current squad, not locked
          </p>
        )}
        <div className="flex flex-col gap-4 sm:gap-6">
          {rows.map((row, i) => (
            <div key={i} className="flex flex-wrap items-start justify-center gap-x-1 gap-y-3 sm:gap-x-4">
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
    <div className="-mx-4 mt-3 overflow-hidden border-y border-pl-border bg-pl-off sm:mx-0 sm:rounded-lg sm:border">
      <p className="border-b border-pl-border px-3 py-2 text-[11px] font-semibold tracking-wider text-pl-muted uppercase">
        Bench
      </p>
      <div className="flex flex-wrap items-start justify-center gap-x-1 gap-y-3 px-1.5 py-4 sm:gap-x-4">
        {bench.map((entry) => (
          <div key={entry.key} className="flex flex-col items-center">
            <PlayerCardResponsive entry={entry} mode={mode} fixtureFor={fixtureFor} />
            <span className="mt-1 text-[10px] font-semibold text-pl-muted">{benchLabel(entry, bench)}</span>
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
}: {
  entry: PitchPlayer
  mode: CardMode
  fixtureFor: (entry: PitchPlayer) => string
}) {
  const fixtureText = fixtureFor(entry)
  return (
    <>
      <span className="sm:hidden">
        <PlayerCard entry={entry} mode={mode} fixtureText={fixtureText} compact />
      </span>
      <span className="hidden sm:block">
        <PlayerCard entry={entry} mode={mode} fixtureText={fixtureText} compact={false} />
      </span>
    </>
  )
}
