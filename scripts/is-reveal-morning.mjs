/**
 * Is today, in London, the morning after some gameweek's final fixture?
 *
 * The workflow's tight 08:45-10:30 polling window runs every day, because
 * cron cannot read the fixture list; this can. It exits 0 on a reveal
 * morning and 1 otherwise, and the workflow skips the tight-window run when
 * it is not. Derived from the published revealFromUtc, which the fetch sets
 * from each gameweek's last kickoff, so it follows Sunday, Monday and
 * midweek finishes alike.
 */
import { readFile } from 'node:fs/promises'

const londonDate = (iso) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(iso)
  )

const { gameweeks } = JSON.parse(await readFile('public/data/gameweeks.json', 'utf8'))
const today = londonDate(new Date().toISOString())
const match = gameweeks.some((gw) => gw.revealFromUtc && londonDate(gw.revealFromUtc) === today)
console.log(match ? `Reveal morning: a gameweek confirms today (${today}).` : `Not a reveal morning (${today}).`)
process.exit(match ? 0 : 1)
