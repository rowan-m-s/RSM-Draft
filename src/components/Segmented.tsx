/**
 * The segmented control that sits above the banner, in the position the
 * reference site uses for its league switcher.
 *
 * A darker track with the selected segment lifted onto a surface in white
 * text. The others are muted on the track itself.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  aside,
}: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  /** Something small to sit at the right-hand end of the bar. */
  aside?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 border-b border-pl-border bg-pl-surface px-4 py-3 sm:px-6">
      <span className="eyebrow hidden text-pl-muted sm:block">{label}</span>
      <div role="tablist" aria-label={label} className="flex min-w-0 flex-1 gap-1 rounded-lg bg-pl-bg p-1 sm:flex-none">
        {options.map((option) => {
          const selected = option.value === value
          return (
            <button
              key={option.value}
              role="tab"
              type="button"
              aria-selected={selected}
              onClick={() => onChange(option.value)}
              className={[
                'flex-1 rounded-md px-2.5 py-1.5 text-[13px] font-semibold whitespace-nowrap transition-colors sm:flex-none sm:px-4 sm:text-sm',
                selected ? 'bg-pl-surface-2 text-pl-text' : 'text-pl-muted hover:text-pl-text',
              ].join(' ')}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      {aside && <div className="ml-auto shrink-0">{aside}</div>}
    </div>
  )
}
