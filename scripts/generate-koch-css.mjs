/**
 * Regenerates the `.koch-*` block in src/index.css from the timeline
 * constants in src/lib/kochTimeline.ts.
 *
 *   node scripts/generate-koch-css.mjs
 *
 * The block in index.css is delimited by two marker comments. Everything
 * between them is replaced outright; everything outside is untouched. Floater
 * positions (translate/rotate/scale per floater) live here rather than in
 * kochTimeline.ts because nothing outside this generator needs them — only
 * the millisecond constants that Reveal.tsx also reads belong in that file.
 */
import { readFile, writeFile } from 'node:fs/promises'
import * as T from '../src/lib/kochTimeline.ts'

const START_MARKER = '/* KOCH-TIMELINE:GENERATED START — do not hand-edit; run `npm run koch:css` (see src/lib/kochTimeline.ts) */'
const END_MARKER = '/* KOCH-TIMELINE:GENERATED END */'

/** translate(Xvw, Yvh) rotate(Rdeg) scale(S) per floater, unchanged by the timeline. */
const FLOATER_POSES = [
  { x: -18, y: -28, r: -8, s: 0.9 },
  { x: 18, y: -18, r: 7, s: 0.85 },
  { x: -18, y: 24, r: -6, s: 0.95 },
  { x: 18, y: 20, r: 9, s: 0.88 },
  { x: -20, y: -34, r: -5, s: 0.82 },
]

if (FLOATER_POSES.length !== T.FLOATER_COUNT) {
  throw new Error(`FLOATER_POSES has ${FLOATER_POSES.length} entries, expected FLOATER_COUNT (${T.FLOATER_COUNT})`)
}

const ms = () => `${T.TOTAL_MS}ms`
const p = T.pct

function floaterBlock(i) {
  const n = i + 1
  const pose = FLOATER_POSES[i]
  const transform = `translate(-50%, -50%) translate(${pose.x}vw, ${pose.y}vh) rotate(${pose.r}deg) scale(${pose.s})`
  const inMs = T.FLASH_IN_MS + i * T.FLOATER_STEP_MS
  const holdEndMs = inMs + T.FLOATER_HOLD_MS
  const outMs = holdEndMs + T.SNAP_MS
  return `.koch-floater-${n} {
  position: absolute; top: 50%; left: 50%; max-width: 44vw; text-align: center;
  opacity: 0;
  animation: koch-floater-${n} ${ms()} linear forwards;
}
@keyframes koch-floater-${n} {
  0%, ${p(inMs - T.SNAP_MS)} { opacity: 0; }
  ${p(inMs)} { opacity: 1; transform: ${transform}; }
  ${p(holdEndMs)} { opacity: 1; transform: ${transform}; }
  ${p(outMs)}, 100% { opacity: 0; transform: ${transform}; }
}`
}

const css = `${START_MARKER}
/* ====================================================================
   Koch-only reveal. Timed from src/lib/kochTimeline.ts — do not hand-tune
   the percentages below; change a *_MS constant there and regenerate.
   ==================================================================== */
.koch-overlay {
  opacity: 1;
  animation: koch-overlay-out ${ms()} linear forwards;
}
@keyframes koch-overlay-out {
  0%, ${p(T.CARD_IN_MS)} { opacity: 1; }
  100% { opacity: 0; }
}
.koch-breaking {
  color: var(--color-pl-amber);
  opacity: 0;
  animation: koch-breaking ${ms()} linear forwards;
}
@keyframes koch-breaking {
  0%, ${p(T.BREAKING_CUT_MS - T.SNAP_MS)} { opacity: 0; transform: scale(1); }
  ${p(T.BREAKING_CUT_MS)} { opacity: 1; transform: scale(1); }
  ${p(T.BREAKING_SCALE_MS)} { opacity: 1; transform: scale(1.04); }
  ${p(T.BREAKING_OUT_MS)}, 100% { opacity: 0; transform: scale(1.04); }
}
.koch-phase2 {
  color: var(--color-pl-text);
  opacity: 0;
  animation: koch-phase2 ${ms()} linear forwards;
}
@keyframes koch-phase2 {
  0%, ${p(T.PHASE2_IN_MS - T.SNAP_MS)} { opacity: 0; }
  ${p(T.PHASE2_IN_MS)}, ${p(T.PHASE2_OUT_MS)} { opacity: 1; }
  ${p(T.PHASE2_OUT_MS + T.SNAP_MS)}, 100% { opacity: 0; }
}
.koch-word { opacity: 0; }
.koch-word1 { animation: koch-word1 ${ms()} linear forwards; }
.koch-word2 { animation: koch-word2 ${ms()} linear forwards; }
.koch-word3 { animation: koch-word3 ${ms()} linear forwards; }
@keyframes koch-word1 { 0%, ${p(T.PHASE2_IN_MS - T.SNAP_MS)} { opacity: 0; transform: translateY(6px); } ${p(T.PHASE2_IN_MS)} { opacity: 1; transform: none; } ${p(T.WORD1_OUT_MS)}, 100% { opacity: 0; transform: none; } }
@keyframes koch-word2 { 0%, ${p(T.WORD1_OUT_MS)} { opacity: 0; transform: translateY(6px); } ${p(T.WORD2_IN_MS)} { opacity: 1; transform: none; } ${p(T.WORD2_OUT_MS)}, 100% { opacity: 0; transform: none; } }
@keyframes koch-word3 { 0%, ${p(T.WORD2_OUT_MS)} { opacity: 0; transform: translateY(6px); } ${p(T.WORD3_IN_MS)} { opacity: 1; transform: none; } ${p(T.PHASE2_OUT_MS)}, 100% { opacity: 0; transform: none; } }

.koch-flash-seen-alone {
  position: absolute; top: 50%; left: 50%; width: 80vw; text-align: center;
  opacity: 0;
  animation: koch-flash-seen-alone ${ms()} linear forwards;
}
@keyframes koch-flash-seen-alone {
  0%, ${p(T.FLASH_IN_MS - T.SNAP_MS)} { opacity: 0; transform: translate(-50%, -50%) scale(1); }
  ${p(T.FLASH_IN_MS)} { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  ${p(T.CARD_IN_MS)} { opacity: 1; transform: translate(-50%, -50%) scale(1.15); }
  100% { opacity: 1; transform: translate(-50%, -50%) scale(1.15); }
}
.koch-haaas {
  display: inline-block;
  clip-path: inset(0 100% 0 0);
  animation: koch-haaas-reveal ${ms()} linear forwards;
}
@keyframes koch-haaas-reveal {
  0%, ${p(T.FLASH_IN_MS - T.SNAP_MS)} { clip-path: inset(0 100% 0 0); }
  ${p(T.HAAAAS_WIPE_END_MS)}, 100% { clip-path: inset(0 0 0 0); }
}
.koch-name-reveal {
  display: inline-block;
  clip-path: inset(0 100% 0 0);
  animation: koch-name-reveal ${ms()} linear forwards;
}
@keyframes koch-name-reveal {
  0%, ${p(T.NAME_WIPE_START_MS)} { clip-path: inset(0 100% 0 0); }
  ${p(T.NAME_WIPE_END_MS)}, 100% { clip-path: inset(0 0 0 0); }
}
.koch-sting-card {
  opacity: 0;
  animation: koch-sting-card ${ms()} linear forwards;
}
@keyframes koch-sting-card {
  0%, ${p(T.CARD_IN_MS)} { opacity: 0; }
  100% { opacity: 1; }
}
${Array.from({ length: T.FLOATER_COUNT }, (_, i) => floaterBlock(i)).join('\n')}

.sting-still .koch-overlay { animation: none; opacity: 0; }
.sting-still .koch-breaking, .sting-still .koch-phase2, .sting-still .koch-word,
.sting-still .koch-flash-seen-alone { animation: none; }
.sting-still .koch-haaas { animation: none; clip-path: inset(0 0 0 0); }
.sting-still .koch-name-reveal { animation: none; clip-path: inset(0 0 0 0); }
${Array.from({ length: T.FLOATER_COUNT }, (_, i) => `.sting-still .koch-floater-${i + 1} { animation: none; }`).join('\n')}
.sting-still .koch-sting-card { animation: none; opacity: 1; }
${END_MARKER}`

const path = 'src/index.css'
const original = await readFile(path, 'utf8')
const startIdx = original.indexOf(START_MARKER)
const endIdx = original.indexOf(END_MARKER)
if (startIdx === -1 || endIdx === -1) {
  throw new Error(`Could not find both markers in ${path}. Expected:\n  ${START_MARKER}\n  ${END_MARKER}`)
}
const before = original.slice(0, startIdx)
const after = original.slice(endIdx + END_MARKER.length)
await writeFile(path, `${before}${css}${after}`)

console.log(`Regenerated the Koch timeline block in ${path}.`)
console.log(`TOTAL_MS = ${T.TOTAL_MS} (${(T.TOTAL_MS / 1000).toFixed(2)}s), HOLD_MS = ${T.HOLD_MS}`)
