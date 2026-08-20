# Build brief: FPL Draft League Tracker

> Save as `PROMPT.md` in an empty repo. Open Claude Code there and say:
> "Read PROMPT.md. Work through the phases in order. Stop at the end of each phase and wait for my approval before continuing."
>
> The phase gates matter. Phases 1 and 2 are cheap to redo and expensive to get wrong.

---

## 0. Fill these in before starting

Claude Code: **do not proceed past Phase 1 until every value below is filled.** If any placeholder remains, ask me.

```
LEAGUE_ID             = 23939
LEAGUE_DISPLAY_NAME   = FPL Draft 26/27
SEASON                = 2026/27
NUMBER_OF_MANAGERS    = 11
ENTRY_FEE_PER_MANAGER = 10
SEASON_PRIZE          = 110
WEEKLY_FORFEIT        = 5
DEPLOY_TARGET         = GitHub Pages (public repo, deployed by Action from the build output)
```

**Rules — all confirmed, implement exactly:**

```
TIE_LOWEST_GW      = ALL_PAY. Every manager tied on the lowest score pays £5 each, so the
                     month pot grows. The pot is £5 × charges levied, NOT £5 × gameweeks.
                     Unit test a tied week explicitly.
TIE_MONTHLY_WINNER = SPLIT_EVENLY between tied managers.
KOCH_CAN_WIN_MONTH = TRUE. A manager who was worst in a week can still win that month.
TRACK_PAYMENTS     = FALSE. No settled/unsettled state, no toggles, no storage. Show one
                     running BALANCE per manager, starting at £0 before GW1:
                       balance = (monthly pots won) − (£5 forfeits charged)
                     The £10 entry fee is NOT part of the balance. The £110 season prize is
                     shown separately as a pending prize, never folded into the balance.
```

---

## 1. What this is

A small, mobile-first web app for an **11-person FPL Draft league** (draft.premierleague.com — *not* a classic mini-league).

Reference for the general vibe: https://spikethehedgehog-fpl.github.io/FFS-DRAFT/ — but much smaller. We are taking its league table and player-ownership ideas and leaving the rest.

### The money rules

1. Each gameweek, the **lowest** scorer pays **£5** into that month's pot. They are the **Koch of the Week**.
2. At month end, the manager with the **highest total across that month's gameweeks** takes the whole pot. September with 4 gameweeks = **£20**. They are the **Manager of the Month**.
3. Everyone pays **£10** entry. Top of the table at season end takes **£110**. Fixed all season.

### Assigning gameweeks to months

A gameweek belongs to the calendar month of its **deadline**, from `deadline_time` in the bootstrap data. That value is UTC — **convert to Europe/London before reading the month**, or a late deadline on the 31st lands in the wrong month during British Summer Time. Unit test that exact case.

### The managers

Eleven, known by nickname: `rushy, kellett, wallis, jls, paddy, bennett, wood, rowan, jason, dj, ollie`

These nicknames appear **nowhere in the FPL data** — the API knows people by real name and team name. A hand-filled mapping bridges the two (see Phase 3).

---

## 2. Architecture

Static site. No live calls to FPL from the browser — **the FPL API sends no CORS headers, so browser fetches will fail**. A scheduled job fetches server-side and commits JSON to the repo.

```
scripts/fetch-data.mjs  →  writes public/data/*.json  →  committed by GitHub Action
public/data/*.json      →  read by the React app at load
```

- **Stack:** Vite + React + Tailwind, TypeScript. No backend, no database. Deployed to GitHub Pages by an Action — set Vite's `base` to the repo name or every asset 404s and you get a blank white page.
- **Schedule:** Actions minutes are unlimited on a public repo, so run the job often. Roughly:
  - every **15 minutes** Sat–Sun, 11:00–23:00 UTC
  - every **30 minutes** Mon–Fri, 17:00–23:00 UTC (evening fixtures)
  - every **3 hours** otherwise
  - plus `workflow_dispatch` for manual runs

  Cron is UTC, not UK time — that's an hour out for most of the season, so shift the windows accordingly or just widen them. GitHub's cron often runs late and very tight schedules get skipped under load; 15 minutes is about as fine as is reliable. Don't engineer around the lateness.
- **Only commit when the data actually changed.** Compare generated JSON against what's committed, skip if identical. This matters more with a frequent cron — without it you'd get hundreds of empty commits a week.
- **Every JSON file carries a `generatedAt` timestamp.** The UI shows it as "Updated 14 minutes ago", in a warning colour past 3 hours. A silently dead fetch job is this design's main failure mode and it has to be visible.
- **The repo is public** — that's the condition of free Pages. No tokens, no keys, ever.

### Manual refresh

GitHub Pages has no serverless functions, and a GitHub token must never reach the browser of a public repo. So a true one-tap trigger isn't possible on this stack.

Build two things instead:

1. **A reload control** available to everyone — re-fetches the JSON files with a cache-busting query so nobody is looking at a stale copy held by their browser. This does not pull new data from FPL, so label it "Reload", never "Refresh".
2. **A "Force update (admin)" link** that opens the repo's Actions page, where I can run the workflow manually. Only I have write access, so it does nothing for anyone else. State next to it that an update takes a couple of minutes and needs a reload afterwards.

With a 15-minute cron on match days this should rarely be needed. If it turns out to be, the upgrade path is a free Cloudflare Worker holding a fine-grained token and calling `workflow_dispatch` — don't build that now.

---

## 3. Phase 1 — Discover the API

**Write nothing else until this is done.** My knowledge of the Draft API's exact shape may be stale, so verify rather than assume.

Write `scripts/explore.mjs` that hits each endpoint, saves raw responses to `.api-samples/` (gitignored), and prints the top-level keys.

Endpoints on `https://draft.premierleague.com/api/`:

| Endpoint | Expected use |
|---|---|
| `bootstrap-static` | All players (`elements`), all gameweeks (`events`) with `deadline_time`, `finished`, `data_checked` |
| `league/23939/details` | League name, `league_entries` (entry ids, team names, real names), standings |
| `league/23939/element-status` | **Ownership** — which manager owns which player, and who's a free agent. Verify this exists; if it does it replaces 11 separate picks calls |
| `entry/{entry_id}/event/{gw}` | One manager's picks for one gameweek |
| `event/{gw}/live` | Every player's points for that gameweek |

**Then stop and report to me:**

1. The actual field names for per-gameweek manager points.
2. Whether an ownership endpoint exists and what it returns.
3. Whether picks distinguish starters from bench, and whether auto-subs are already applied.
4. **Whether the events data includes a waiver or trade deadline** as well as the gameweek deadline — in a draft league the waiver deadline is arguably the one people care about.
5. The eleven entry ids, each with its real name and team name, so I can map them to nicknames.
6. **The working URL pattern for player photos and club badges.** The `elements` data carries a photo reference per player and a code per team; these resolve to images on `resources.premierleague.com`. Work out the current pattern by testing a real one in the browser, and report both the photo URL and the badge URL that actually load. Don't assume the path from memory — it has changed between seasons.

### Player photos

Hotlink them, don't download them. Nearly 600 players is far too many images to commit, and `<img src>` is unaffected by CORS — that restriction only applies to `fetch`, which is why the data needs a server-side job but the pictures don't.

Build the URL from the photo reference in `elements`. **Every player image needs an `onerror` fallback** to a neutral silhouette: new signings routinely have no photo for weeks, and a broken-image icon in every third row looks awful. Same for club badges.

### The auto-subs trap

Draft applies automatic substitutions **after** a gameweek finishes. Naively summing the starting XI mid-week gives numbers that don't match the official ones, and the money would be wrong.

If an endpoint gives official per-gameweek manager totals, **use it as the source of truth**. Compute from picks only where forced. Either way, **money only locks once `data_checked` is true**. Before that the week shows as provisional, greyed, with no £ attached.

---

## 4. Phase 2 — Design pass, before any data wiring

Build the full UI as a **static design pass with hardcoded mock data**. No fetching, no pipeline. I approve the look before anything gets wired up, because reworking a design after it's plumbed in is where the time goes.

Use plausible fake data: real-looking scores in the 20–70 range, actual Premier League player names, a tied Koch week, a settled month and an in-progress one, and one long team name to check nothing overflows.

### Layout

Replicate the reference site's shell. **Desktop:** a fixed left sidebar around 260px, white, with the league mark and "Draft 26/27" at the top, the nav below it, and a **compact league table pinned at the bottom of the sidebar** — rank, nickname, total points, with the same rank accent bars. It persists on every page. Content area fills the rest.

**Mobile:** the sidebar collapses to a bottom tab bar with the five nav items. The compact table appears inline on Home only, not in the tab bar.

Active nav item: purple text with a cyan left bar, as in the reference.

### The five views

Nav is exactly: **Home · League Table · Managers · Players · Honours**

**Home** — in this order:
1. **Deadline strip** — live countdown to the next deadline. Waiver deadline too if it exists, both labelled.
2. **Koch of the Week** — that manager's Koch image, name, score. The biggest thing on the page.
3. **Manager of the Month** — that manager's MOTM image, name, monthly total, pot won.
4. **Money strip** — this month's pot so far, and the £110 season prize.

**League Table** — one page with a **segmented toggle sitting above the banner**, in the position the reference uses for its league switcher:

`[ Gameweek ]  [ Month ]  [ Overall ]`

Selected segment gets the solid purple fill with white text; the others are outlined. Default to Overall. The banner subtitle below updates to say which view is showing.

- *Overall* — the season table. Five columns only: rank, manager (28px face icon + nickname), GW, month, total. Thin vertical accent bar on the left of each row: cyan for 1st, muted for 2nd and 3rd, pink for last. Nothing else in this table — no averages, no counters, no money. It should read in one second.
- *Gameweek* — a gameweek picker defaulting to the latest finished one, then every manager's score for that week with the Koch highlighted at the bottom. Provisional weeks visibly marked. Use a slider for the picker, as the reference does — it's a better fit than a dropdown for 38 sequential values, and it works well under a thumb.
- *Month* — month picker. That month's table, the pot, the winner once settled, and the top performer line ("Haaland for Jason — 34 pts").

*Optional, only once everything else is finished:* a play button beside the gameweek slider that steps through the season and animates the table reordering. Nice, not needed.

**Managers** — the eleven, each with face icon, rank, total points, **Koch count**, **MOTM count**, and running balance. Negative and positive balances coloured differently, sorted worst first. Tapping a manager opens their profile: current squad, month-by-month history, their best performer, and their Koch and MOTM history.

This is where the counters and the money live. Neither goes in the league table.

**Players** — as specced below.

**Honours** — three sections, in this order:

1. **Previous winners** — past season champions, most recent first, shown as their winner card images. Two entries so far, from `src/config/honours.json`:

```json
[
  { "season": "2025/26", "key": "dj",    "image": "dj.png" },
  { "season": "2024/25", "key": "rushy", "image": "rushy.png" }
]
```

I add a line and an image by hand each summer. Nothing about this section is computed or fetched, and the current season does not appear here — nobody has won anything yet.

2. **Manager of the Month** — every month's winner so far, newest first, as their MOTM card images.

3. **Koch of the Week** — every Koch so far, newest first, as their Koch card images. Group by month.

This is the payoff for having 22 graphics: by March it's a wall of them, and it's the page people will actually send each other. Empty states for sections 2 and 3 before the first awards land.

**Players** — who owns who. Modelled closely on the reference site's Players screen.

*Banner:* gradient header with "Season 26/27" in cyan small caps, "Players" as the display heading, a one-line subtitle, and a **leading scorer panel** on the right — that player's photo, name, position · club · owner, and their points as a large numeral. Cyan/green/pink segmented strip beneath.

*Controls row:* search by player or club; position filter (All / GK / DEF / MID / FWD); ownership filter (All / Free agents / Owned); a live count of matching players; sort toggles for points and points per game.

*Columns:* player (photo + name), position badge, club, **owner**, points, PPG, goals, assists, clean sheets, bonus. Position badges are colour-coded — pick four distinguishable tints that sit on the purple background.

**Two columns from the reference do not apply to us:** fee and value. Those come from that site's own auction system. FPL Draft has no prices at all — players are drafted, not bought. Leave both out rather than inventing a number. Rank within position we can compute ourselves from points.

*Default view* is owned players. Free agents behind the filter, since the interesting data is the ~165 players actually in squads, not the 400 nobody wants.

*Mobile:* ten columns will not fit at 375px. Show player, position, club, owner and points as the row; put the rest behind a tap-to-expand. Do not use a horizontal scroll — it hides data people won't know is there.

### The counters

Koch and MOTM tallies run all season. **They do not go in the league table** — that stays five columns. They live on the **Managers** page as two columns, and drive the **Honours** page.

Note the tie interaction: an all-pay tied week awards a Koch to more than one manager, so the league-wide Koch count can exceed the number of gameweeks played. That's correct, not a bug.

### The countdown

The deadline timestamp comes from FPL; the countdown then **ticks every second in the browser** against the device clock. No fetching involved — a fixed future timestamp doesn't go stale, so it stays accurate to the second however old the JSON is.

The one thing that does rot is *which* deadline to count to. So store the **full list of deadlines** and pick the first one still in the future at render time. Don't trust a precomputed "next gameweek" field — if it says GW4 and GW4's deadline passed at lunchtime, the app sits on a negative countdown until the next fetch. Handle the season-over case where no future deadline exists.

Show days/hours/minutes/seconds, and switch to a more urgent treatment inside the final hour.

### Design direction

Match the reference site closely. It is a **light theme** — white surfaces, dark navy text, with the Premier League purple reserved for banners and chrome. Confirmed; do not improvise an alternative.

```css
--pl-purple:    #37003C   /* banners, sidebar active state, display headings */
--pl-navy:      #1B1B3A   /* body text and all scores */
--pl-white:     #FFFFFF   /* page and card background */
--pl-off:       #F7F7F9   /* row hover, subtle striping */
--pl-border:    #E5E5EB   /* hairlines */
--pl-pink:      #E90052   /* Koch of the week, negative balances, active sort */
--pl-green:     #00FF87   /* fills and dark backgrounds ONLY */
--pl-green-ink: #00A550   /* green as text on white */
--pl-cyan:      #04F5FF   /* fills and dark backgrounds ONLY */
--pl-cyan-ink:  #0090A8   /* cyan as text or links on white */
--pl-muted:     #6B6B7B   /* labels, secondary text */
```

**Contrast rules, and these matter:**

- **Never render #00FF87 or #04F5FF as text on white.** They're near-invisible. Use the `-ink` variants for any green or cyan text. The bright originals are for fills, badges, and text sitting on the purple banner.
- Pink works as text on white and as a fill. It stays reserved: Koch, negative balances, active sort state. Nothing else.
- Body text is navy. Scores are navy and large. Labels are muted.

**Banners:** each page gets a purple-to-pink diagonal gradient header, with the season in cyan small caps above the page title, and a segmented cyan/green/pink strip beneath. This gradient is the one place gradients are allowed — no gradient buttons, cards, or text.

**Type:** a condensed display face for numbers and headings, a neutral one for body. Apply `font-variant-numeric: tabular-nums` to every table — proportional digits make leaderboard columns visibly wobble.

**Avoid:** grids of equal cards, emoji, decorative icons carrying no information.

**375px is the primary target.** Eleven mates will open this on phones on a Saturday evening. Desktop matters too here, since the sidebar layout is desktop-first — build both properly.

### Images

**Three sets, 33 files.** No compositing, no overlaying, no text rendered on top. The app picks the right file and displays it.

```
public/images/icon/{key}.png     11 face icons — small circular avatars
public/images/koch/{key}.png     11 Koch of the week cards
public/images/motm/{key}.png     11 Manager of the month cards
public/images/winner/{key}.png   season winner cards — NOT one per manager, see below
```

The eleven keys, lowercase: `rushy, kellett, wallis, jls, paddy, bennett, wood, rowan, jason, dj, ollie`

Source files are named `{name}.{type}.png` (`kellett.icon.png`, `DJ.Winner.png`) with inconsistent capitalisation. Normalise everything to lowercase. **Assert all 33 files exist across icon, koch and motm at build time and fail loudly otherwise** — the keys must match exactly across those three folders. A missing file means a blank card or a hole in a table row that nobody notices until it's that person's week.

**The winner folder is the exception** and must not be swept into that check. It holds one image per *past season*, not per manager, and currently contains two — DJ for 2025/26 and Rushy for 2024/25. Validate it the other way round: every entry in the honours config must have a matching file. Nine managers having no winner image is expected.

**Icons** are used everywhere a manager's name appears: the sidebar mini table, league table, gameweek and monthly tabs, the Managers page, the owner column in the players list, and the Honours page. Render as a circle at around 28px in table rows, larger on the feature cards. These are the one set that **should** be square-cropped and centred — small circular avatars, as in the reference.

**Koch and MOTM cards have mixed aspect ratios** — some landscape, some portrait. Do not force a square crop, it decapitates people. Fixed card frame, image fitted inside, letterboxed against the card background. Test both orientations.

Add `scripts/optimise-images.mjs` (sharp): icons to a 64px square webp, cards to a sensible display width, jpg fallbacks throughout. These are photographs saved as PNG, several MB each — 33 unoptimised would make the site painful on mobile data in a pub, which is exactly where it gets opened.

**Branding:** the site uses the Premier League lion, supplied as `PremierLeagueLogo` in `public/images/`. Use it in the header and page banners. The sidebar mark is a simple wordmark for the league name — no second logo needed.

### Empty states

The site launches with no Koch until GW1 finishes and no Manager of the Month until the first month settles — four or five weeks of empty cards in the most prominent position. Design both properly: "First award: end of September". Don't hide the card, don't leave a hole.

**Stop here and show me.** Do not start Phase 3 until I've approved the design.

---

## 5. Phase 3 — The data pipeline

`scripts/fetch-data.mjs` fetches everything and writes the files below. **Compute all derived values here, in Node** — the React components stay dumb.

**`src/config/managers.json`** — hand-filled once, mapping FPL entries to nicknames:

```json
[{ "entryId": 000000, "key": "rushy", "displayName": "Rushy" }]
```

The `entryId` values are the one thing deliberately left blank — they come out of Phase 1. Everything else in section 0 is already filled.

Validate at build time that all eleven league entries have a mapping and every key has both images. Fail otherwise.

**`public/data/league.json`** — league name, season, managers, `generatedAt`.

**`public/data/gameweeks.json`** — per gameweek: number, deadline (UTC and Europe/London), assigned month, `finished`, `data_checked`, every manager's score, the Koch(es), the £ charged.

**`public/data/months.json`** — per month with at least one gameweek: its gameweeks, each manager's monthly total, the winner, the pot, whether settled, and each manager's top-scoring player.

**`public/data/season.json`** — cumulative table, Koch and MOTM counts per manager, and per-manager balance (forfeits charged, pots won, resulting balance).

**`public/data/players.json`** — every owned player: id, name, position, club, club code, photo reference, owning manager key, points, PPG, goals, assists, clean sheets, bonus. Free agents in a separate array so the default view stays small. Include the league-wide leading scorer for the banner.

**Top performer:** per manager per month, sum each player's points *as they counted for that manager* — only gameweeks where they were in the scoring XI. Output `{ player, manager, points }`. Also compute a league-wide best.

**Invariant to assert in a test:** once every gameweek in a month is settled, the eleven balances must sum to exactly £0 — money only moves between managers. Mid-month the sum equals the negative of the current unpaid pot. If either fails, the maths is wrong.

**Rate limiting:** cache finished gameweeks to `public/data/cache/` and only re-fetch anything not yet `data_checked`. 200ms between requests. Descriptive `User-Agent`.

**Fail loudly.** A failed fetch exits non-zero so the Action goes red. Never write partial JSON over good data.

---

## 6. Phase 4 — Wire it up

Replace the mock data with the real files. The design should not change. If it does, something was wrong in Phase 2 — say so rather than quietly adjusting.

Then set up the Action and deploy.

---

## 7. Don't build

No head-to-head. No cup. No login. No database. No live in-play polling. No transfer or waiver history. No admin CMS. No notifications. No charting library unless a chart genuinely beats a table, which here it usually doesn't.

---

## 8. Done when

- `node scripts/fetch-data.mjs` produces every JSON file from the real league.
- The month-boundary test passes for a BST deadline late on the 31st.
- A tied-lowest week is unit tested and grows the pot correctly.
- Balances sum to £0 across a fully settled month.
- A gameweek that isn't `data_checked` shows as provisional with no money attached.
- The countdown ticks in real time, finds the next future deadline even when the data is stale, and handles the season being over.
- The league table has five columns and nothing else.
- All 33 icon/koch/motm images resolve and a missing one fails the build; the winner folder is validated against the honours config instead, not against the eleven keys.
- Every view is usable at 375px, and the sidebar layout holds up on desktop.
- Bright green and cyan never appear as text on white.
- A stale `generatedAt` is visibly flagged.
- The Action runs on a cron and can be triggered manually.
