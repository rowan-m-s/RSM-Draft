# Addendum 01 — squad view and player photos

Two changes to the live site. Read alongside `PROMPT.md`; everything in that brief still stands.

---

## 1. Player photos are outdated

Symptom: headshots pull through fine but show players in old kits or at former clubs. Nothing 404s, so nothing errors — it just quietly serves last season's images.

Cause: almost certainly the image base path. FPL scopes player photos to a season, and the older path still resolves rather than failing, returning whatever was current when that path was last populated.

**Fix this empirically, don't guess at a URL.** Write a throwaway script that:

1. Takes half a dozen players whose images you can verify by eye — pick a mix including at least two who **changed club in the last window**, since they're the ones that expose a stale path.
2. Builds candidate URLs for each, varying the season segment of the path and the size segment (there are commonly 110x140 and 250x250 variants), and using both the `photo` field and the `code` field from `elements` as the filename, since which one applies has differed between patterns.
3. Requests each candidate and records the status and content length.
4. Prints a table of which combinations return 200.

Then **open the winning URLs in a browser and check the images are actually current** — a 200 proves the file exists, not that it's this season's photo. That eye check is the whole point; a stale path returns 200 all day long.

Once confirmed, put the resolved pattern in one place as a single helper function, not inlined at each call site, so the next time it changes it's a one-line fix. Add a comment recording the date it was verified.

Keep the existing `onerror` silhouette fallback. Do the same check for club badges.

---

## 2. Squad view

### Entry point

On the League Table, a manager's row becomes clickable. Clicking expands an inline panel below the row showing:

- **Best performer** — their highest-scoring player for the currently selected view (gameweek, month, or season, following the segmented toggle), with the points.
- A **View squad** button.

Only one row expands at a time; opening another closes the first. Keep the collapsed row exactly as it is now — five columns, unchanged.

### The squad page

Route: `/managers/{key}/squad`, with the gameweek as a URL parameter so a specific week can be linked and shared.

**Pitch graphic.** A football pitch laid out by formation, cards positioned in rows: keeper, defenders, midfielders, forwards. The bench sits in a separate strip along the bottom, visually distinct from the pitch, labelled with bench order.

**Each player card** shows the player photo, surname, and one line beneath it. There is **no toggle** — the mode is determined by the gameweek:

- *Gameweek has started or finished* → that player's **points** for that week.
- *Gameweek hasn't started* → their **fixture**, as opponent and home/away, e.g. `AVL (H)`.

That's it. The user never chooses; the state of the week decides.

**Reference layouts** are saved at `assets-src/IMG_2093.jpg` and `assets-src/IMG_2094.jpg` — **open both**. One is the official FPL pitch view: shirt image per player, name on a dark band, fixture on a lighter band below, plus the availability flags described further down. The other is a third-party version showing a **price** under each name. Follow the FPL one for layout. Draft has no prices, so that slot takes the points or the fixture instead — do not invent a value.

Identify which file is which by opening them; don't assume from the filenames.

### Availability flags

Replicate FPL's injury and availability flags. A small triangular flag sits in the corner of the player card:

- **Yellow** — doubtful. Player has a knock, illness or a partial chance of featuring.
- **Red** — ruled out. Injured, suspended, or otherwise unavailable.
- **No flag** — fully available.

The `elements` data carries an availability status code and a percentage chance of playing the next round, plus a free-text `news` field explaining why ("Knock — 75% chance of playing") and a timestamp for when that news was added. **Verify the exact field names against a real payload before building** — check what the Draft bootstrap actually returns rather than assuming it matches the classic game.

Map red to the codes meaning injured, suspended or unavailable, yellow to doubtful. Tapping or hovering the flag shows the news text — the reason is more useful than the colour, and it's already in the data.

Flags appear on the squad pitch and in the Players list. They matter most before a gameweek starts, but leave them visible throughout rather than special-casing.

**One caveat worth acting on.** Injury news breaks at Thursday and Friday press conferences, and the current cron drops to three-hourly outside match windows. A flag could sit up to three hours stale exactly when people are checking it before a deadline. Tighten the schedule to every 30 minutes on Thursday and Friday between roughly 09:00 and 20:00 UK. Actions minutes are unlimited on a public repo, so this costs nothing.

### Gameweek switching

Reuse the same slider component as the League Table's gameweek view, so it behaves identically. Defaults to the latest finished gameweek. Stepping back through GW2, GW1 and so on shows the squad **as it was that week**, not the current squad with old points attached — in a draft league squads change through waivers and trades, so this distinction is real and getting it wrong would show the wrong players.

Mark auto-substitutions visibly: a player who came off the bench should read as having done so.

### Data

Squad picks per manager per gameweek are already fetched for the top-performer calculation. Persist them rather than discarding: write `public/data/squads/gw{n}.json`, one file per gameweek, so the page loads only the week it needs. Eleven managers times fifteen players times thirty-eight weeks in one file would be a needless payload on every visit.

Fixtures data is needed for fixtures mode — reuse whatever the reveal timing work already pulls for kick-off times.

### Mobile

Five cards across a pitch row at 375px is roughly 70px each. That works only if the cards drop to photo, surname and one number, with everything else removed. Build the mobile card as its own thing rather than shrinking the desktop one until it breaks. Check a 3-5-2 specifically, since five across is the worst case.

---

## 3. Asset import fixes

Two problems in `assets-src/` that will break the existing file check:

**Mixed extensions.** The icons are `.jpg` while the koch, motm and winner cards are `.png`. The original brief specified `.png` throughout, so a strict check will report all eleven icons missing. Match on the **key and type only** — `{key}.icon.*` — and accept either extension. The optimiser converts everything to webp anyway, so the source format is irrelevant beyond finding the file.

**Non-manager files in the same folder.** `IMG_2093.jpg` and `IMG_2094.jpg` are reference screenshots, not assets. `DJ.winner.png` also uses a capitalised key. So: lowercase every filename before matching, ignore anything that doesn't match the `{key}.{type}` pattern, and **print what was skipped** rather than failing silently. If a real asset is ever misnamed, that log line is what tells you — silently ignoring unmatched files means a typo looks identical to a deliberate exclusion.

The 33-file assertion still stands, and the winner folder is still validated against the honours config rather than the eleven keys.

---

## Acceptance

- A player who changed club recently shows their current club's photo, verified by eye.
- The photo URL pattern lives in one helper with a dated comment.
- Expanding a table row doesn't alter the collapsed row's five columns.
- Stepping back to GW1 shows that week's actual squad, not the current one.
- A 3-5-2 is legible at 375px.
- A card shows the fixture before the week starts and points once it has, with no toggle anywhere.
- A flagged player shows the right colour and the news text on tap.
- All eleven `.jpg` icons are found, and the two IMG reference files are skipped with a log line.
