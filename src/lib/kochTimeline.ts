/**
 * Single source of truth for the Koch-only reveal's timeline.
 *
 * Every keyframe percentage in index.css's `.koch-*` block, and the ticker
 * delays in Reveal.tsx, are derived from the millisecond constants below —
 * change a value here, run `npm run koch:css` (scripts/generate-koch-css.mjs)
 * to regenerate the CSS block, and the whole sequence stays in sync. This
 * used to be ~20 hand-computed percentage blocks plus two hardcoded
 * millisecond literals in Reveal.tsx, kept in sync by hand across many
 * tuning passes — retuning the pause before the name reveal alone meant
 * recomputing every stop after it.
 *
 * All exported *_MS values are milliseconds from the sting mounting.
 * SNAP_MS is the width of every "hard cut" transition in this design
 * (BREAKING NEWS appearing, each word in the NEW/KOCH/ANNOUNCED stack
 * swapping, a floater popping in or out): two keyframe stops SNAP_MS apart
 * read as instant rather than a visible fade, which is deliberate
 * throughout — not an approximation to clean up.
 */

export const SNAP_MS = 6

/* Beat 1a: BREAKING NEWS cuts in, drifts to a slightly larger scale, fades. */
export const BREAKING_CUT_MS = 60
export const BREAKING_SCALE_MS = 760
export const BREAKING_OUT_MS = 900

/* Beat 1b: NEW / KOCH / ANNOUNCED, one word on screen at a time. */
export const PHASE2_IN_MS = 1050
export const WORD_VISIBLE_MS = 444
export const WORD1_OUT_MS = PHASE2_IN_MS + WORD_VISIBLE_MS
export const WORD2_IN_MS = WORD1_OUT_MS + SNAP_MS
export const WORD2_OUT_MS = WORD2_IN_MS + WORD_VISIBLE_MS
export const WORD3_IN_MS = WORD2_OUT_MS + SNAP_MS
export const PHASE2_OUT_MS = WORD3_IN_MS + WORD_VISIBLE_MS

/* Beat 2: "HAAAAS ANYONE SEEN" wipes in, mocking floaters cycle alongside
   it, then — the pause this module exists to make tunable — everything
   holds completely still before the name wipes in underneath. */
export const FLASH_IN_MS = 2550
export const HAAAAS_WIPE_MS = 600
export const HAAAAS_WIPE_END_MS = FLASH_IN_MS + HAAAAS_WIPE_MS

export const FLOATER_COUNT = 5
export const FLOATER_HOLD_MS = 394
/** One floater's full appear-hold-snap-out cycle, back to back with the next. */
export const FLOATER_STEP_MS = FLOATER_HOLD_MS + SNAP_MS
export const FLOATERS_DONE_MS = FLASH_IN_MS + FLOATER_COUNT * FLOATER_STEP_MS

/**
 * The pause itself: nothing moves from here but the slow background scale
 * push on the whole "HAAAAS ANYONE SEEN" block, which already spans this
 * entire stretch (see koch-flash-seen-alone in index.css) — stretching the
 * pause automatically slows that creep too, rather than leaving it to pick
 * up the gap on its own. This is the one value to change to retune it.
 */
export const HOLD_MS = 2000

export const NAME_WIPE_START_MS = FLOATERS_DONE_MS + HOLD_MS
export const NAME_WIPE_MS = 506
export const NAME_WIPE_END_MS = NAME_WIPE_START_MS + NAME_WIPE_MS

/* Beat 3: a hard cut to the card, once the name has held for a moment. */
export const CARD_HOLD_MS = 500
export const CARD_IN_MS = NAME_WIPE_END_MS + CARD_HOLD_MS
export const CARD_FADE_MS = 400

export const TOTAL_MS = CARD_IN_MS + CARD_FADE_MS

/** The ticker track's own scroll-loop starts this long after the bar's
 *  entrance, so the two motions don't land in the same instant. */
export const TICKER_LOOP_GAP_MS = 200

/** A millisecond offset as a percentage of the total, to 3dp — matching the
 *  precision already hand-tuned throughout the existing CSS. */
export function pct(ms: number): string {
  return `${((ms / TOTAL_MS) * 100).toFixed(3)}%`
}
