# Addendum 02

Six changes, batched. Read alongside `PROMPT.md` and `ADDENDUM-01.md`, both of which still stand except where noted below.

Work through them in order. Sections 1 to 4 are small and self contained; 5 and 6 are the larger pieces.

---

## 1. Rename the sidebar mark

Top left currently reads "RSM Draft 26/27". Change the mark to **"FPL"**, with "Draft 26/27" beneath it in the smaller style, matching the reference layout.

The repo name stays as it is. This is display copy only.

---

## 2. Remove every em dash

Strip em dashes (the long `—` character) from all user facing copy: headings, labels, empty states, tooltips, the reveal graphic, error messages, everything the user reads.

Do not simply swap in a hyphen where that reads badly. Rewrite the sentence so it does not need one. A comma, a colon, a full stop or a shorter sentence is almost always better.

Scope is UI copy only. Leave code comments and data alone.

Then add a test that scans the source for em dashes in user facing strings and fails if any are found, so they do not creep back in with the next feature.

Note: this covers em dashes only. En dashes (`–`) in numeric ranges are untouched unless you see them used as punctuation, in which case remove those too.

---

## 3. Rename "best performer" to "MVP"

In the manager dropdown on the League Table, the "best performer" line becomes **"MVP"**, short for most valuable player.

Keep it season long and constant: the player who has scored the most points for that manager across the season to date. It does not change with the segmented Gameweek / Month / Overall toggle. Show the player name and their points total for that manager.

---

## 4. Local image overrides for players with no photo

Some drafted players have no photo on the FPL CDN, so they fall back to the silhouette. Allow a local image to be dropped in to fix those, without touching anything else.

**Resolution order for every player image:**

1. `public/images/players/{code}.png` if it exists (local override)
2. the FPL CDN URL, using the pattern resolved in Addendum 01
3. the silhouette fallback

Key the override on the element `code` rather than the id, since the code is stable across seasons and the id is not guaranteed to be.

**Also add a report script** that prints every currently owned player with no usable photo: their code, name, club and owning manager, plus the exact filename to save the override as. Without this I have no way of knowing which images to go and find. Run it as part of the fetch job and print the list to the Action log.

Scope this to owned players only. Several hundred unowned players also lack photos and are not a concern.

---

## 5. Pages open at the previous scroll position

**Symptom:** navigating from one page to another, say clicking Managers while halfway down the Players list, lands you partway down the new page instead of at the top. It happens on every route.

**Cause:** the router swaps the page content without touching the scroll position, so the window stays where it was.

**Fix:** scroll to the top on navigation. Two details matter more than the fix itself.

**Only on a path change, not a query change.** Several views keep state in the URL: the gameweek slider, the squad page's week parameter, the players filters. If the scroll reset fires on any URL change, dragging the gameweek slider will yank the user to the top of the page mid interaction, which is worse than the bug being fixed. Watch the pathname only and ignore the query string.

**Back and forward should restore, not reset.** Pressing back after scrolling down a long players list should return you to where you were, not the top. A fresh navigation goes to the top; a history pop restores the previous position. React Router's built in scroll restoration handles this distinction, so prefer it over a hand rolled effect that scrolls on every render.

**Check specifically:**

- Players list scrolled down, click Managers, lands at top.
- Players list scrolled down, click a manager, press back, returns to the same spot in the list.
- Squad page scrolled down, drag the gameweek slider, page does not jump.

---

## 6. Add GW0, the initial draft

**Symptom:** the squad view tries to fit all fifteen players onto a pitch built for eleven, because before the first deadline a Draft squad has no XI and bench split. It is just fifteen players.

**Fix:** add **GW0**, labelled "First Draft", as the first position on the gameweek slider. It shows each manager's squad as drafted, and is always available.

### Where the data comes from

The draft picks endpoint, likely `league/{LEAGUE_ID}/choices` on the Draft API, but **verify against a real payload** before building. It should give, per pick: the round and pick number, the entry that made it, and the player taken. Persist it as `public/data/squads/gw0.json`.

### Deriving an XI from draft order

There is no real XI for GW0, so we infer one. Be explicit about that: label the view "XI inferred from draft order" so nobody mistakes it for an official lineup.

Selection rule is the **highest drafted valid eleven**. Walk the manager's picks in draft order and select into the XI, subject to formation constraints:

- exactly **1 goalkeeper**
- at least **3 defenders**
- at least **2 midfielders**
- at least **1 forward**

Naively taking the first eleven by draft order can produce an illegal team, with two keepers, or only two defenders if someone loaded up on midfielders early. So fill the minimums first using each position's highest drafted players, then fill the remaining slots by draft order across all positions. The four not selected go to the bench in draft order, with the second keeper in the keeper slot.

Assert the resulting XI is a legal formation for all eleven managers. If any squad cannot produce one, fail loudly rather than rendering a broken pitch.

### What the cards show

In GW0 mode the third line on each card is the **draft pick number**, "Pick 3", "Pick 27". Not points, not a fixture. That is the interesting information here and the whole reason to look back at it.

### Which gameweeks are selectable

- **GW0** is always available.
- **GW1 and beyond** only once picks exist for that week. Picks do not exist in Draft until the deadline passes, so a future gameweek has no squad to show at all. Do not render an empty pitch. Just do not offer that position on the slider yet.

This supersedes the fixtures mode note in Addendum 01 for any gameweek before its deadline, since there is no squad to attach fixtures to. Fixtures mode still applies to a gameweek whose deadline has passed but whose matches have not started.

The slider defaults to the latest gameweek with points. Until GW1 completes, that is GW0.

**Check specifically:** a manager who drafted several players of one position early still gets a legal XI, and the bench holds exactly one keeper and three outfielders.

---

## Acceptance

- Sidebar reads "FPL" with "Draft 26/27" beneath.
- No em dash appears anywhere in user facing copy, and the test catches one if reintroduced.
- The manager dropdown shows "MVP" with the player and their points for that manager.
- A local override in `public/images/players/` takes precedence over the CDN, and the missing photo report lists owned players with no image and the filename to use.
- Navigating between pages lands at the top; the back button restores position; the gameweek slider does not cause a jump.
- GW0 renders a legal eleven plus four for every manager, with draft pick numbers on the cards.
