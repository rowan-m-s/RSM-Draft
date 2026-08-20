# Addendum 05: full theme overhaul

Re-theme the whole site to match the current Premier League look: deep aubergine background, cyan to violet gradient banners, white type.

**This supersedes the light theme in `PROMPT.md`.** That section was based on the FFS reference site, which is light. The official Premier League site is dark, and dark is what we want. Everything else in the brief still stands.

**Do this before Part A of Addendum 03.** That work styles the player cards and pitch, and if the tokens change underneath afterwards it gets done twice.

Reference screenshots are in `assets-src`: the Table page, a content page, and the brand asset showing the chevron device. Open all three.

---

## 1. Tokens

Define these once as CSS variables and refactor every component to use them. **Do not hand edit colours component by component.** If a hex appears anywhere outside the token definition, that is a bug, and a re-theme should be a one file change next time.

```css
--pl-bg:        #2B0A2E   /* page background, deep aubergine */
--pl-surface:   #3A0F3E   /* rows, cards, raised panels */
--pl-surface-2: #481449   /* hover, selected, nested panels */
--pl-border:    rgba(255,255,255,0.10)

--pl-text:      #FFFFFF   /* primary text and all scores */
--pl-muted:     rgba(255,255,255,0.65)   /* labels, secondary text */

--pl-cyan:      #04F5FF   /* accents, active nav, links, countdown */
--pl-violet:    #963CFF   /* gradient start, secondary accent */
--pl-pink:      #FF2882   /* Koch of the week, negative balances */
--pl-green:     #00FF87   /* Manager of the month, money won, positive */
```

**Note the pink has changed** from `#E90052` to `#FF2882`. The darker red pink is close in value to the aubergine background and goes muddy on it. The brighter pink reads cleanly. Check it against the background before accepting it.

**The contrast rules invert.** On the old white surfaces, cyan and green were unusable as text and needed darkened variants. On aubergine they are legible and look right, so the `-ink` variants can go. Body text stays white or muted white regardless: cyan is for accents and numerals, not paragraphs.

Pink remains reserved. Koch and negative balances only, nowhere else.

---

## 2. Banners

Every page gets a gradient header, as on the reference.

**Gradient** runs diagonally from violet through blue to cyan, left to right. Over it, the **chevron device**: large angular bands in the aubergine background colour cutting across at a consistent diagonal, as in the brand asset. That angular shape is the single most recognisable part of the identity, so get the angle consistent across pages rather than approximating it per banner.

Page title in white, large, in the display face. Season above it in small caps.

Keep the segmented cyan, green and pink strip beneath the banner from the current build.

---

## 3. Components

**Tables.** Rows on `--pl-surface`, hairline separators in `--pl-border`, hover to `--pl-surface-2`. White text, muted column headers. Keep tabular numerals.

**Rank numbers zero padded**, as the reference does: 01, 02, 03. Small detail, and it is a large part of why their table looks considered rather than default.

**Filter pills.** Rounded, transparent fill, light border, white text. Selected state gets a solid fill rather than just a colour change.

**Segmented controls.** Darker track, selected segment in a lifted surface with white text. The League Table Gameweek / Month / Overall control follows this.

**Sidebar.** Now dark rather than white. Nav items in muted white, active item white with a cyan left bar. The compact league table at the bottom sits on `--pl-surface`.

**Cards, including Koch and Manager of the Month.** Aubergine surfaces with a hairline border. The images do the work; the frame should be quiet.

---

## 4. Depth and finish

The reference reads as premium because of restraint rather than effect. Three things carry it:

- **Generous spacing.** More room between rows and sections than feels necessary. The current build is tighter than the reference and that alone makes it feel cheaper.
- **Hairline borders instead of heavy dividers.** Ten percent white, one pixel.
- **One accent at a time.** A screen with cyan, green and pink all shouting reads as a dashboard. Each screen should have one dominant accent and use the others sparingly.

No glows, no neon, no heavy shadows. The surfaces are flat; the gradient banner is the only flourish.

---

## 5. Check before finishing

- Muted text on `--pl-surface` needs to stay comfortably readable. If it does not, lift the muted value rather than darkening the surface.
- Pink on aubergine: verify by eye at small sizes, not just as a fill.
- The reveal graphic, the empty states and any error copy all need re-checking. Those are the screens that get missed in a re-theme and then show up in the wrong colours a week later.
- Player photo cut outs are transparent, so they will now sit on aubergine rather than white. Check none of them have a white halo from their original background.

---

## Acceptance

- Every colour in the app comes from a token; no stray hex values outside the definitions.
- Background is aubergine, banners carry the gradient and the chevron device at a consistent angle.
- Pink is `#FF2882`, still reserved for Koch and negative balances.
- Rank numbers are zero padded.
- The sidebar is dark with a cyan active indicator.
- Reveal, empty states and error copy all re-themed, not just the main pages.
- No white halos around player cut outs.
