/**
 * The money and calendar rules, in one place.
 *
 * These run in Node (the fetch script) and in the browser (mock data, tests),
 * so they must stay dependency-free.
 */

import type { ManagerKey } from '../types'

export const WEEKLY_FORFEIT = 5
export const SEASON_PRIZE = 110
export const ENTRY_FEE = 10

/**
 * The calendar month a gameweek belongs to, as YYYY-MM.
 *
 * `deadline_time` is UTC. During British Summer Time, London is an hour ahead,
 * so a deadline at 23:30Z on the 31st is already the 1st of the next month in
 * London. Reading the month off the UTC string would put it in the wrong month
 * and move the pot. Always convert first.
 */
export function monthOfDeadline(deadlineIso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date(deadlineIso))
  const year = parts.find((p) => p.type === 'year')!.value
  const month = parts.find((p) => p.type === 'month')!.value
  return `${year}-${month}`
}

/**
 * The same instant written in Europe/London, with its offset — so
 * '2026-08-21T17:30:00Z' becomes '2026-08-21T18:30:00+01:00'.
 *
 * Stored alongside the UTC value so the committed JSON is readable by a human
 * checking whether a gameweek landed in the right month, without having to do
 * BST arithmetic in their head. The UI still formats from the UTC value.
 */
export function londonIso(iso: string): string {
  const date = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)!.value

  // The offset is whatever London is from UTC at that instant: +01:00 in BST,
  // +00:00 in GMT. Derived from the formatted wall time rather than assumed.
  const asUtc = Date.UTC(
    Number(get('year')),
    Number(get('month')) - 1,
    Number(get('day')),
    Number(get('hour')) % 24,
    Number(get('minute')),
    Number(get('second'))
  )
  const offsetMinutes = Math.round((asUtc - date.getTime()) / 60_000)
  const sign = offsetMinutes < 0 ? '-' : '+'
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0')

  return (
    `${get('year')}-${get('month')}-${get('day')}T${String(Number(get('hour')) % 24).padStart(2, '0')}:` +
    `${get('minute')}:${get('second')}${sign}${pad(offsetMinutes / 60)}:${pad(offsetMinutes % 60)}`
  )
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function monthLabel(monthId: string): string {
  const [year, month] = monthId.split('-')
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`
}

export function monthShortLabel(monthId: string): string {
  const [, month] = monthId.split('-')
  return MONTH_NAMES[Number(month) - 1]
}

/**
 * Everyone tied on the lowest score is a Koch and each pays.
 *
 * The pot therefore grows by £5 × the number charged, not £5 × gameweeks — a
 * three-way tie puts £15 in.
 */
export function kochesOf(scores: Record<ManagerKey, number>): ManagerKey[] {
  const entries = Object.entries(scores) as [ManagerKey, number][]
  if (entries.length === 0) return []
  const lowest = Math.min(...entries.map(([, points]) => points))
  return entries.filter(([, points]) => points === lowest).map(([key]) => key)
}

export function chargeFor(kochKeys: ManagerKey[]): number {
  return kochKeys.length * WEEKLY_FORFEIT
}

/** Everyone tied on the highest monthly total. They split the pot evenly. */
export function monthWinnersOf(totals: Record<ManagerKey, number>): ManagerKey[] {
  const entries = Object.entries(totals) as [ManagerKey, number][]
  if (entries.length === 0) return []
  const highest = Math.max(...entries.map(([, points]) => points))
  return entries.filter(([, points]) => points === highest).map(([key]) => key)
}

/** Formats £ with no decimals when whole, two when a split leaves pennies. */
export function money(amount: number): string {
  const sign = amount < 0 ? '−' : ''
  const abs = Math.abs(amount)
  const body = Number.isInteger(abs) ? String(abs) : abs.toFixed(2)
  return `${sign}£${body}`
}

/** Balance including the sign, for the Managers page. £0 renders as '£0'. */
export function signedMoney(amount: number): string {
  if (amount === 0) return '£0'
  return amount > 0 ? `+${money(amount)}` : money(amount)
}

/**
 * The first deadline still in the future.
 *
 * Deliberately derived from the full list rather than a precomputed "next
 * gameweek" field: if the JSON is hours stale, that field can point at a
 * deadline that has already passed and the countdown runs negative until the
 * next fetch. Returns null once the season is over.
 */
export function nextDeadline<T extends { deadlineUtc: string }>(
  gameweeks: readonly T[],
  now: Date = new Date()
): T | null {
  const future = gameweeks
    .filter((gw) => new Date(gw.deadlineUtc).getTime() > now.getTime())
    .sort((a, b) => new Date(a.deadlineUtc).getTime() - new Date(b.deadlineUtc).getTime())
  return future[0] ?? null
}

/** Same, for the waiver deadline, which is the one draft managers actually miss. */
export function nextWaiver<T extends { waiversUtc: string | null }>(
  gameweeks: readonly T[],
  now: Date = new Date()
): T | null {
  const future = gameweeks
    .filter((gw) => gw.waiversUtc && new Date(gw.waiversUtc).getTime() > now.getTime())
    .sort((a, b) => new Date(a.waiversUtc!).getTime() - new Date(b.waiversUtc!).getTime())
  return future[0] ?? null
}

export interface Remaining {
  days: number
  hours: number
  minutes: number
  seconds: number
  totalMs: number
  /** Under an hour — the countdown switches to an urgent treatment. */
  urgent: boolean
}

export function remainingUntil(target: string, now: Date = new Date()): Remaining {
  const totalMs = Math.max(0, new Date(target).getTime() - now.getTime())
  const totalSeconds = Math.floor(totalMs / 1000)
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    totalMs,
    urgent: totalMs > 0 && totalMs < 3600_000,
  }
}

/** 'Updated 14 minutes ago'. Past three hours the caller shows it as a warning. */
export function relativeAge(generatedAt: string, now: Date = new Date()) {
  const ms = now.getTime() - new Date(generatedAt).getTime()
  const minutes = Math.floor(ms / 60_000)
  const stale = ms > 3 * 3600_000

  let text: string
  if (minutes < 1) text = 'just now'
  else if (minutes === 1) text = '1 minute ago'
  else if (minutes < 60) text = `${minutes} minutes ago`
  else {
    const hours = Math.floor(minutes / 60)
    if (hours < 24) text = hours === 1 ? '1 hour ago' : `${hours} hours ago`
    else {
      const days = Math.floor(hours / 24)
      text = days === 1 ? '1 day ago' : `${days} days ago`
    }
  }
  return { text, stale, minutes }
}

export function formatLondon(iso: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...opts,
  }).format(new Date(iso))
}
