import type { ReactNode } from 'react'
import { LION } from '../lib/assets'

/**
 * Every page's header. Purple-to-pink diagonal gradient with the season in
 * cyan small caps above the title and the cyan/green/pink strip beneath.
 *
 * This gradient is the only one in the design. The bright cyan is legible here
 * because it sits on purple, not on white.
 */
export function Banner({
  season,
  title,
  subtitle,
  aside,
}: {
  season: string
  title: string
  subtitle: string
  aside?: ReactNode
}) {
  return (
    <header>
      <div className="banner-gradient flex flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:gap-6 sm:px-6 sm:py-6">
        {/* The supplied artwork is the full lockup — lion plus wordmark, 500×210,
            so about 2.38:1. Height is fixed and width follows; giving it a
            square box squashes it. */}
        <img
          src={LION}
          alt="Premier League"
          width={114}
          height={48}
          className="hidden h-12 w-auto shrink-0 object-contain sm:block"
        />
        <div className="min-w-0 flex-1">
          <p className="eyebrow text-pl-cyan">{season}</p>
          <h1 className="display mt-0.5 text-3xl leading-none text-pl-white sm:text-4xl">{title}</h1>
          <p className="mt-1.5 text-sm text-white/70">{subtitle}</p>
        </div>
        {aside && <div className="shrink-0 sm:border-l sm:border-white/15 sm:pl-6">{aside}</div>}
      </div>
      <div className="banner-strip" />
    </header>
  )
}
