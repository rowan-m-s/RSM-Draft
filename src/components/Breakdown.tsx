import type { PointsComponent } from '../types'

/**
 * Where a player's points came from, one line per component, as Draft
 * scored them. Shared by the Fixtures page and the squad pitch.
 *
 * Only what scored is listed. A defender with ninety minutes and a clean
 * sheet is two lines, not eight of "assists 0". A player with nothing to
 * list did not play.
 *
 * Bonus settles a few hours after the whistle. Until the week is confirmed
 * and none has been attributed yet, a footnote says it is still to come.
 */
export function Breakdown({
  components,
  confirmed,
  className = '',
}: {
  components: PointsComponent[]
  confirmed: boolean
  className?: string
}) {
  const rows = components.filter((c) => c.points !== 0)
  const hasBonus = rows.some((c) => c.stat === 'bonus')
  return (
    <ul className={`tnum space-y-0.5 text-xs ${className}`}>
      {rows.length === 0 && <li className="text-pl-muted">Did not play</li>}
      {rows.map((c) => {
        return (
          <li key={c.stat} className="flex items-baseline justify-between gap-4">
            <span className="text-pl-muted">
              {c.name}
              {c.stat !== 'bonus' && c.value !== 0 && <span className="text-pl-muted/70"> · {c.value}</span>}
            </span>
            <span className="font-semibold text-pl-text">{c.points > 0 ? `+${c.points}` : c.points}</span>
          </li>
        )
      })}
      {!confirmed && !hasBonus && rows.length > 0 && (
        <li className="pt-0.5 text-[11px] text-pl-muted/80">Bonus still to come</li>
      )}
    </ul>
  )
}

/** "15pts", and "1pts" too: one shape on every row reads better than a correct singular. */
export function pts(n: number): string {
  return `${n}pts`
}
