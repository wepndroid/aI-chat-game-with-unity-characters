type UploadFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  multiline?: boolean
  tokenLimit?: number
  accentBorder?: boolean
  placeholder?: string
}

const UploadField = ({ label, value, onChange, multiline = false, tokenLimit, accentBorder = false, placeholder = '' }: UploadFieldProps) => {
  const tokenCounter = tokenLimit ? `${Math.min(value.length, tokenLimit)} / ${tokenLimit} tokens` : null
  const borderClassName = accentBorder ? 'border-ember-400/60' : 'border-white/20'

  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">{label}</span>
      <div className="relative">
        {multiline ? (
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            rows={2}
            placeholder={placeholder}
            className={`w-full resize-none rounded-md border bg-black/20 px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-ember-300 focus:ring-1 focus:ring-ember-300/30 ${borderClassName}`}
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            className={`w-full rounded-md border bg-black/20 px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-ember-300 focus:ring-1 focus:ring-ember-300/30 ${borderClassName}`}
          />
        )}
        {tokenCounter ? <span className="absolute right-2 top-1 text-[10px] font-semibold text-white/35">{tokenCounter}</span> : null}
      </div>
    </label>
  )
}

export default UploadField
