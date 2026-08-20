/**
 * The segmented control that sits above the banner, in the position the
 * reference site uses for its league switcher.
 *
 * Selected segment: solid purple fill, white text. The others are outlined.
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
    <div className="flex items-center gap-3 border-b border-pl-border bg-pl-white px-4 py-3 sm:px-6">
      <span className="eyebrow hidden text-pl-muted sm:block">{label}</span>
      <div role="tablist" aria-label={label} className="flex flex-1 gap-2 sm:flex-none">
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
                'flex-1 rounded-md px-4 py-2 text-sm font-semibold transition-colors sm:flex-none',
                selected
                  ? 'bg-pl-purple text-pl-white'
                  : 'border border-pl-border bg-pl-white text-pl-navy hover:bg-pl-off',
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
