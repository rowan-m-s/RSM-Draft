import type { Dataset } from '../data'
import type { ReconciliationRecord } from '../types'

/**
 * The §4 safety net, surfaced: once FPL confirms a gameweek we had already
 * locally finalised and acted on — money charged, a reveal already run —
 * reconciliation compares the two. A Koch mismatch here means real money
 * sitting on the wrong person, so this has to be loud and persistent, not a
 * line in a build log nobody reads. It never dismisses itself: it goes away
 * only when the data no longer lists the mismatch, i.e. someone has actually
 * looked into it, not just closed a toast.
 */
export function mismatches(data: Dataset): ReconciliationRecord[] {
  return data.reconciliation.filter((r) => !r.kochMatch)
}

export function ReconciliationAlert({ data }: { data: Dataset }) {
  const bad = mismatches(data)
  if (bad.length === 0) return null

  const nameOf = (key: string) => data.league.managers.find((m) => m.key === key)?.displayName ?? key
  const names = (keys: string[]) => (keys.length ? keys.map(nameOf).join(' & ') : 'nobody')

  return (
    <div role="alert" className="border-b border-pl-red bg-pl-red/10 px-4 py-2.5 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-1.5">
        {bad.map((record) => (
          <p key={record.event} className="text-sm leading-snug text-pl-text">
            <span className="font-bold text-pl-red">Koch mismatch, GW{record.event}:</span> we named{' '}
            <span className="font-semibold">{names(record.ourKochKeys)}</span>, FPL's confirmed figures say{' '}
            <span className="font-semibold">{names(record.fplKochKeys)}</span>. Money has already been charged on
            our result. Check it by hand.
          </p>
        ))}
      </div>
    </div>
  )
}
