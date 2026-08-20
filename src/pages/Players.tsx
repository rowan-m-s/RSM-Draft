import { useMemo, useState } from 'react'
import { Banner } from '../components/Banner'
import { ClubBadge, ManagerAvatar, PlayerPhoto } from '../components/Img'
import { PageBody } from '../components/Layout'
import { PlayerFlag } from '../components/PlayerFlag'
import { useData } from '../data'
import type { Player, Position } from '../types'

/**
 * Four tints that stay distinguishable on the purple banner and on white, and
 * that don't collide with pink's reserved meaning.
 */
const POSITION_STYLE: Record<Position, string> = {
  GKP: 'bg-amber-100 text-amber-900',
  DEF: 'bg-sky-100 text-sky-900',
  MID: 'bg-emerald-100 text-emerald-900',
  FWD: 'bg-violet-100 text-violet-900',
}

const POSITIONS: (Position | 'ALL')[] = ['ALL', 'GKP', 'DEF', 'MID', 'FWD']
type Ownership = 'owned' | 'free' | 'all'
type Sort = 'points' | 'ppg'

function PositionBadge({ position }: { position: Position }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${POSITION_STYLE[position]}`}>
      {position}
    </span>
  )
}

function Pill({
  active,
  onClick,
  children,
  tone = 'navy',
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  tone?: 'navy' | 'pink'
}) {
  const activeClass = tone === 'pink' ? 'bg-pl-pink text-pl-white' : 'bg-pl-navy text-pl-white'
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded px-2.5 py-1.5 text-xs font-bold tracking-wide uppercase',
        active ? activeClass : 'border border-pl-border bg-pl-white text-pl-navy hover:bg-pl-off',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function LeadingScorer({ player, ownerName }: { player: Player; ownerName: string | null }) {
  return (
    <div className="flex items-center gap-4">
      <PlayerPhoto
        photoCode={player.photoCode}
        name={player.name}
        size="large"
        className="h-16 w-16 shrink-0 rounded-full bg-white/10 object-cover object-top"
      />
      <div className="min-w-0">
        <p className="eyebrow text-pl-cyan">Leading scorer</p>
        <p className="display truncate text-2xl leading-none text-pl-white">{player.name}</p>
        <p className="mt-1 truncate text-xs text-white/70">
          {player.position} · {player.clubShort} · {ownerName ?? 'free agent'}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="display tnum text-4xl leading-none text-pl-white">{player.points}</p>
        <p className="text-[10px] font-semibold tracking-wider text-white/60 uppercase">points</p>
      </div>
    </div>
  )
}

/** Row detail on mobile. Ten columns will not fit at 375px, and a horizontal
 *  scroll hides data people never find, so the rest goes behind a tap. */
function MobileDetail({ player }: { player: Player }) {
  const stats = [
    { label: 'PPG', value: player.ppg.toFixed(1) },
    { label: 'Goals', value: player.goals },
    { label: 'Assists', value: player.assists },
    { label: 'Clean sheets', value: player.cleanSheets },
    { label: 'Bonus', value: player.bonus },
    { label: `${player.position} rank`, value: player.positionRank },
  ]
  return (
    <div className="grid grid-cols-3 gap-3 border-t border-pl-border bg-pl-off px-4 py-3">
      {stats.map((stat) => (
        <div key={stat.label}>
          <p className="text-[10px] font-semibold tracking-wider text-pl-muted uppercase">{stat.label}</p>
          <p className="tnum mt-0.5 font-bold text-pl-navy">{stat.value}</p>
        </div>
      ))}
    </div>
  )
}

export function Players() {
  const { data } = useData()
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState<Position | 'ALL'>('ALL')
  // Default to owned: the interesting data is the ~165 players in squads, not
  // the hundreds nobody wants.
  const [ownership, setOwnership] = useState<Ownership>('owned')
  const [sort, setSort] = useState<Sort>('points')
  const [expanded, setExpanded] = useState<number | null>(null)

  const nameOf = (key: string | null) =>
    key ? (data.league.managers.find((m) => m.key === key)?.displayName ?? key) : null

  const filtered = useMemo(() => {
    const pool =
      ownership === 'owned'
        ? data.players.owned
        : ownership === 'free'
          ? data.players.freeAgents
          : [...data.players.owned, ...data.players.freeAgents]

    const needle = query.trim().toLowerCase()
    return pool
      .filter((p) => position === 'ALL' || p.position === position)
      .filter(
        (p) =>
          !needle ||
          p.name.toLowerCase().includes(needle) ||
          p.club.toLowerCase().includes(needle) ||
          p.clubShort.toLowerCase().includes(needle)
      )
      .sort((a, b) => (sort === 'points' ? b.points - a.points : b.ppg - a.ppg))
  }, [data.players, ownership, position, query, sort])

  const visible = filtered.slice(0, 200)
  const leading = data.players.leadingScorer

  return (
    <>
      <Banner
        season={`Season ${data.league.season.replace('20', '').replace('/20', '/')}`}
        title="Players"
        subtitle="Who owns who, and what they're worth in points."
        aside={leading ? <LeadingScorer player={leading} ownerName={nameOf(leading.owner)} /> : undefined}
      />

      <PageBody>
        <div className="card mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 p-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search player or club"
            aria-label="Search player or club"
            className="w-full min-w-0 rounded-md border border-pl-border px-3 py-2 text-sm placeholder:text-pl-muted sm:w-auto sm:max-w-xs sm:flex-1"
          />

          <div className="flex gap-1.5">
            {POSITIONS.map((p) => (
              <Pill key={p} active={position === p} onClick={() => setPosition(p)}>
                {p === 'ALL' ? 'All' : p}
              </Pill>
            ))}
          </div>

          <div className="flex gap-1.5">
            {(
              [
                ['owned', 'Owned'],
                ['free', 'Free agents'],
                ['all', 'All'],
              ] as const
            ).map(([value, label]) => (
              <Pill key={value} active={ownership === value} onClick={() => setOwnership(value)}>
                {label}
              </Pill>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-3">
            <span className="tnum text-xs text-pl-muted">{filtered.length} players</span>
            <div className="flex gap-1.5">
              <Pill active={sort === 'points'} onClick={() => setSort('points')} tone="pink">
                Pts
              </Pill>
              <Pill active={sort === 'ppg'} onClick={() => setSort('ppg')} tone="pink">
                PPG
              </Pill>
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="display text-xl text-pl-navy">Nothing matches</p>
            <p className="mt-1.5 text-sm text-pl-muted">
              {data.players.owned.length === 0 && ownership === 'owned'
                ? 'No squads yet. Ownership appears once the draft has happened.'
                : 'Try a different search or filter.'}
            </p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            {/* Narrow screens get their own row shape. Five columns at 375px
                truncates both the player name and the owner to uselessness,
                and a horizontal scroll would hide data nobody knows is there —
                so player, position, club and owner stack into one cell. */}
            <ul className="lg:hidden">
              {visible.map((player) => {
                const owner = nameOf(player.owner)
                const isOpen = expanded === player.id
                return (
                  <li key={player.id} className="border-b border-pl-border last:border-0">
                    <div className="flex items-center gap-3 py-2 pr-2 pl-3">
                      <span className="relative shrink-0">
                        <PlayerPhoto
                          photoCode={player.photoCode}
                          name={player.name}
                          className="h-9 w-9 rounded-full bg-pl-off object-cover object-top"
                        />
                        <PlayerFlag player={player} size={14} className="absolute -top-0.5 -right-0.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-pl-navy">{player.name}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-pl-muted">
                          <PositionBadge position={player.position} />
                          <ClubBadge clubCode={player.clubCode} club={player.club} size={14} />
                          <span className="truncate">
                            {player.clubShort} ·{' '}
                            {owner ? (
                              <span className="text-pl-navy">{owner}</span>
                            ) : (
                              <span className="text-pl-green-ink">Free agent</span>
                            )}
                          </span>
                        </p>
                      </div>
                      <span className="tnum shrink-0 font-bold text-pl-navy">{player.points}</span>
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : player.id)}
                        aria-expanded={isOpen}
                        aria-label={`More about ${player.name}`}
                        className="shrink-0 rounded px-2 py-1 text-lg leading-none text-pl-muted"
                      >
                        {isOpen ? '−' : '+'}
                      </button>
                    </div>
                    {isOpen && <MobileDetail player={player} />}
                  </li>
                )
              })}
            </ul>

            <table className="hidden w-full lg:table">
              <thead>
                <tr className="border-b border-pl-border text-left">
                  {[
                    ['Player', 'py-2.5 pl-3'],
                    ['Pos', 'w-14 py-2.5'],
                    ['Club', 'w-20 py-2.5'],
                    ['Owner', 'w-36 py-2.5'],
                    ['Pts', 'w-16 py-2.5 text-right'],
                    ['PPG', 'w-14 py-2.5 text-right'],
                    ['G', 'w-12 py-2.5 text-right'],
                    ['A', 'w-12 py-2.5 text-right'],
                    ['CS', 'w-12 py-2.5 text-right'],
                    ['Bon', 'w-14 py-2.5 pr-4 text-right'],
                  ].map(([label, className]) => (
                    <th
                      key={label}
                      scope="col"
                      className={`${className} text-[11px] font-semibold tracking-wider text-pl-muted uppercase`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((player) => {
                  const owner = nameOf(player.owner)
                  return (
                    <tr key={player.id} className="border-b border-pl-border last:border-0 hover:bg-pl-off">
                      <td className="py-2 pl-3">
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className="relative shrink-0">
                            <PlayerPhoto
                              photoCode={player.photoCode}
                              name={player.name}
                              className="h-8 w-8 rounded-full bg-pl-off object-cover object-top"
                            />
                            <PlayerFlag player={player} size={13} className="absolute -top-0.5 -right-0.5" />
                          </span>
                          <span className="truncate font-semibold text-pl-navy">{player.name}</span>
                        </span>
                      </td>
                      <td className="py-2">
                        <PositionBadge position={player.position} />
                      </td>
                      <td className="py-2">
                        <span className="flex items-center gap-1.5">
                          <ClubBadge clubCode={player.clubCode} club={player.club} />
                          <span className="text-xs text-pl-muted">{player.clubShort}</span>
                        </span>
                      </td>
                      <td className="py-2">
                        {owner ? (
                          <span className="flex min-w-0 items-center gap-2">
                            <ManagerAvatar managerKey={player.owner!} size={24} />
                            <span className="truncate text-sm text-pl-navy">{owner}</span>
                          </span>
                        ) : (
                          <span className="text-sm text-pl-green-ink">Free agent</span>
                        )}
                      </td>
                      <td className="tnum py-2 text-right font-bold text-pl-navy">{player.points}</td>
                      <td className="tnum py-2 text-right text-sm text-pl-muted">{player.ppg.toFixed(1)}</td>
                      <td className="tnum py-2 text-right text-sm text-pl-muted">{player.goals}</td>
                      <td className="tnum py-2 text-right text-sm text-pl-muted">{player.assists}</td>
                      <td className="tnum py-2 text-right text-sm text-pl-muted">{player.cleanSheets}</td>
                      <td className="tnum py-2 pr-4 text-right text-sm text-pl-muted">{player.bonus}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {filtered.length > visible.length && (
              <p className="border-t border-pl-border bg-pl-off px-4 py-3 text-sm text-pl-muted">
                Showing the top {visible.length} of {filtered.length}. Narrow it with search or a filter.
              </p>
            )}
          </div>
        )}
      </PageBody>
    </>
  )
}
