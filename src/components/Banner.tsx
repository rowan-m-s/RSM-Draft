import type { ReactNode } from 'react'
import { LION } from '../lib/assets'

/**
 * Every page's header. The violet-to-cyan gradient with the chevron device
 * cut across it in the page colour, the season in small caps above a large
 * white title, and the cyan/green/pink strip beneath.
 *
 * The gradient and the chevron are drawn by `.banner-gradient` in index.css,
 * both on `--chevron-angle`, so every page's banner shares one diagonal.
 */
export function Banner({
  season,
  title,
  subtitle,
  aside,
}: {
  season: string
  title: string
  /** A string, or markup that shortens itself at narrow widths. */
  subtitle: ReactNode
  /**
   * Below `sm` the aside sits top right, level with the eyebrow, so the
   * banner stays short; from `sm` it takes the right-hand column as before.
   */
  aside?: ReactNode
}) {
  return (
    <header>
      <div className="banner-gradient relative flex flex-col px-4 py-5 sm:flex-row sm:items-center sm:gap-8 sm:px-6 sm:py-9">
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
        <div className={`font-brand min-w-0 flex-1 ${aside ? 'pr-16 sm:pr-0' : ''}`}>
          <p className="eyebrow text-pl-text/80">{season}</p>
          <h1 className="display mt-1 truncate text-3xl leading-[1.2] text-pl-text sm:text-5xl" title={title}>
            {title}
          </h1>
          <p className="mt-1.5 text-sm text-pl-text/80 sm:mt-2">{subtitle}</p>
        </div>
        {aside && (
          <div className="absolute top-5 right-4 shrink-0 sm:static sm:border-l sm:border-pl-border sm:pl-8">{aside}</div>
        )}
      </div>
      <div className="banner-strip" />
    </header>
  )
}
