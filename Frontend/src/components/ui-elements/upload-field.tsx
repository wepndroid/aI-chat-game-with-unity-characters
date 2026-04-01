type UploadFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  multiline?: boolean
  rows?: number
  /** When set, shows "current / max tokens" on the right of the label row. */
  tokenLimit?: number
  maxLength?: number
  placeholder?: string
  disabled?: boolean
}

const UploadField = ({
  label,
  value,
  onChange,
  multiline = false,
  rows = 2,
  tokenLimit,
  maxLength,
  placeholder = '',
  disabled = false
}: UploadFieldProps) => {
  const counterText =
    tokenLimit !== undefined ? `${value.length} / ${tokenLimit} tokens` : null

  const inputClassName =
    'w-full rounded-[10px] border border-white/15 bg-[#0b0b0b] px-3 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-white/35 ' +
    'group-hover:border-ember-400/75 hover:border-ember-400/75 focus-visible:border-ember-400/90 focus-visible:ring-1 focus-visible:ring-ember-400/25 ' +
    'disabled:cursor-not-allowed disabled:opacity-50 disabled:group-hover:border-white/15 disabled:hover:border-white/15'

  return (
    <label className="group block">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-sm font-normal text-white/70">{label}</span>
        {counterText ? <span className="shrink-0 text-[10px] font-normal text-white/40">{counterText}</span> : null}
      </div>
      <div className="relative">
        {multiline ? (
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            rows={rows}
            placeholder={placeholder}
            maxLength={maxLength}
            disabled={disabled}
            className={`${inputClassName} min-h-[120px] resize-y`}
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            maxLength={maxLength}
            disabled={disabled}
            className={`${inputClassName} h-11`}
          />
        )}
      </div>
    </label>
  )
}

export default UploadField
