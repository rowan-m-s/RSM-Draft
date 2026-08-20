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
}: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="flex items-center gap-3 border-b border-pl-border bg-pl-surface px-4 py-3 sm:px-6">
      <span className="eyebrow hidden text-pl-muted sm:block">{label}</span>
      <div role="tablist" aria-label={label} className="flex flex-1 gap-1 rounded-lg bg-pl-bg p-1 sm:flex-none">
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
                'flex-1 rounded-md px-4 py-1.5 text-sm font-semibold transition-colors sm:flex-none',
                selected ? 'bg-pl-surface-2 text-pl-text' : 'text-pl-muted hover:text-pl-text',
              ].join(' ')}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
