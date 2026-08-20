# Addendum 03

Two pieces of work, batched. Read alongside `PROMPT.md`, `ADDENDUM-01.md`, `ADDENDUM-02.md` and `ADDENDUM-05.md`.

**Part A** is a visual overhaul of the squad view. **Part B** is a new fixtures page.

Do Part A first, and within it section A0 before anything else. Stop between the two parts for my approval.

**This has been rewritten since the dark theme landed.** An earlier version of this file assumed white surfaces and specified drop shadows for depth. That no longer applies. If you have an older copy, discard it.

Any earlier `ADDENDUM-04.md` about a transfers page is dropped. Delete it if present.

---
---

# Part A: visual overhaul of the squad view

The pitch works functionally but looks flat. Reference is `assets-src/IMG_2094.jpg`. Open it before starting.

**Take the treatment, not the design.** That reference is a third party product with its own branding and its own colour scheme. We want the same sense of depth, lighting and containment, rendered in our tokens. Do not copy their card art, their green, or their layout wholesale. Every colour comes from `@theme`, and the palette test still applies.

## A0. First, check a possible bug

The build has shown fifteen players on the pitch labelled "current squad, not locked", for a gameweek whose deadline has not passed. Addendum 02 section 6 says a gameweek should not be selectable until picks exist for it, because there is no XI before the deadline.

Check whether that rule is applied. If the view is reachable, remove it: the slider should offer GW0 and any gameweek with picks, nothing else. This may already be fixed. Confirm either way before doing visual work, so you are not styling a screen that should not exist.

## A1. Player cards, not circles

**Circles are the main problem.** The photos are transparent cut outs of head and shoulders. A circular mask cuts the shoulders off and leaves a head floating with no base, which is why the current version reads as stickers on a background rather than players on a pitch.

Replace with a **rounded rectangle card**, roughly 3:4, portrait.

Card anatomy, top to bottom:

- **Photo area.** The cut out sits inside the card, anchored to the bottom edge so the shoulders meet the card's lower boundary and the head has clearance at the top. Framed, not pasted.
- **Card fill.** A vertical gradient using the existing surface tokens, lighter at the top and darker at the bottom, so the cut out separates from it. Subtle. This is lighting, not decoration.
- **Name band.** Solid aubergine, white text, surname only, one line, truncating with an ellipsis rather than wrapping. Test with the longest name in the league.
- **Info band.** A lifted surface beneath the name. Carries the points, the fixture, or the draft pick number depending on the view, per Addendum 01 and Addendum 02.

**Depth on a dark theme does not come from shadows.** The theme pass removed them for good reason: a drop shadow on an aubergine surface is nearly invisible and just muddies edges. Use value contrast instead. A one pixel light border along the top edge of each card, and the card gradient, will do more than any shadow. If a shadow is used at all it should be a dark, tight, low opacity one to lift the card off the pitch, not a soft glow.

**Availability flags** move to the top corner of the card as a small triangle, sitting on the card rather than floating outside it. Amber for doubtful, pink for ruled out, using the existing tokens.

**Check the silhouette fallback in context.** The theme pass redrew it in white at token alphas. Verify it still reads correctly sitting inside a card on a green pitch, rather than only against an aubergine surface. Eight players still have no photo, so it will be on screen constantly.

## A2. The pitch

Currently flat and brightly lit, which was already too much on white and is worse on aubergine.

**Darken and desaturate the green.** The current value is close to full saturation. On a dark page a bright green rectangle reads as a glowing slab dropped onto the layout. Take it well down, and consider tinting it slightly toward the aubergine so it belongs to the same world as the rest of the site.

**Blend the edges into the page.** This matters more here than it did on a light theme. The pitch should fade toward the page background at its outer edges rather than ending on a hard bright boundary. Combined with the vignette, that is what stops it looking like a pasted rectangle.

**Add perspective.** The reference draws the pitch receding towards the top of the frame, which is what makes it read as a pitch rather than a green box. Achieve this through the markings and stripes, not by transforming the cards. Cards stay flat and upright. Do not skew or scale them, it makes the text illegible.

**Add a vignette.** Darken the edges and corners so attention falls to the centre.

Pitch markings, penalty areas and centre circle at low opacity. Stripes vertical rather than horizontal, subtle enough to read as texture rather than pattern.

The theme pass added pitch tokens. Use and adjust those rather than introducing new values.

## A3. The bench

Currently not visually separated. Give it a distinct shelf below the pitch: a surface tone clearly not part of the playing field, with the cards slightly smaller and slightly desaturated so the XI reads as primary.

Label each bench slot with its position, as the reference does. Keeper first, then the outfield players in bench order.

## A4. Layout and spacing

Rows should be spaced by position with more air between the lines than there is now. The current version distributes rows evenly, which reads as a grid rather than a formation.

Cards within a row are evenly spaced and centred. A row of two and a row of five should feel balanced against each other, not left aligned.

The theme pass loosened spacing generally. Carry the same generosity here.

## A5. Mobile

Five cards across at 375px gives each roughly 70px. At that size the card drops to photo, surname and one number. Nothing else fits and anything else will overlap.

Build the mobile card as its own component rather than shrinking the desktop one until it breaks. Check a 3-5-2 specifically, the worst case, and check the longest surname in the league at that width.

Mobile layout has been unverified so far. Use Chrome's device toolbar rather than resizing the window, and say plainly if you cannot verify it visually.

## Part A acceptance

- No circular player images anywhere on the squad view.
- A cut out photo sits inside its card with shoulders meeting the lower edge, not cropped.
- The pitch reads as receding, has a vignette, and blends into the page background at its edges rather than ending on a hard boundary.
- Cards remain flat and upright.
- Depth comes from value contrast and borders, not from soft shadows.
- The bench is visually distinct from the playing surface and its slots are labelled.
- The silhouette fallback reads correctly inside a card on the pitch.
- A 3-5-2 is legible at 375px with the longest name in the league.
- Every colour still comes from a token and the palette test passes.

**Show me a single styled card in isolation before applying it to the whole pitch.**

---
---

# Part B: fixtures page

A page listing the real Premier League fixtures, with the same gameweek slider used elsewhere, covering GW1 to GW38.

## B1. The data is already here

Fixtures come from the FPL fixtures endpoint, which the pipeline already pulls for the reveal timing and for the fixture labels on squad cards. No new source, no API key, no quota.

Persist the full season to `public/data/fixtures.json` rather than only the weeks currently needed. It is a small file and it means the page loads without extra requests.

Per fixture, store: gameweek, kickoff time in UTC, home team, away team, both scores where played, and the started and finished flags. Team names, short names and badge codes come from the existing bootstrap data.

**Check what else the payload carries** before building, in particular whether it includes fixture difficulty ratings per side. If it does, keep them. If not, do not invent them.

## B2. The page

Add **Fixtures** to the nav, making six items. Check the sidebar and the mobile tab bar both still work at that count before going further.

**Gameweek slider**, the same component as the League Table and squad views, spanning GW1 to GW38. Defaults to the current or next gameweek rather than GW1.

**Fixtures grouped by day**, in kickoff order, with the day as a heading. Each fixture row shows both clubs with badges, then depending on state:

- Not started: the kickoff time.
- In progress: the live score, marked as in progress.
- Finished: the final score.

Convert kickoff times from UTC to Europe/London. Deadlines and kickoffs are both stored in UTC and both need converting, and this is exactly where an hour's error is easy to miss.

## B3. The bit that makes it ours

Show, per fixture, **how many players owned in our league are involved**, split by side. Expanding a fixture lists them with their owner's nickname and face icon.

Without this it is a fixture list anyone can get from a hundred places. With it, it answers the question people in a draft league actually have on a Saturday morning: who have I got playing in this one.

## B4. Blanks and doubles

Two cases a naive implementation gets wrong, and both matter in a draft league:

**Blank gameweeks.** Some clubs have no fixture in a given week. Show which clubs are blank for the selected gameweek, since owning three players from a blanking club is worth knowing before a deadline.

**Double gameweeks.** Some clubs play twice. Do not assume one fixture per club per week, and make the second fixture obvious rather than just listing it twice.

**Postponed or unscheduled fixtures** may have no gameweek or no kickoff time attached. Handle those without crashing, and group them under a clear heading rather than dropping them silently.

## B5. Mobile

Two lines per fixture: clubs and score or time on the first, ownership count on the second. Badges at a small fixed size. No table, no horizontal scroll.

## Part B acceptance

- All 38 gameweeks are selectable and the page defaults to the current one.
- Kickoff times display in UK time, verified against a real fixture.
- A blank gameweek shows which clubs are not playing.
- A club playing twice in a week renders both fixtures clearly.
- Each fixture shows how many owned players are involved, expanding to name them and their owners.
- A fixture with no gameweek assigned does not break the page.
- Six nav items work in both the sidebar and the mobile tab bar.
