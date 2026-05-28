type AuthInputFieldProps = {
  label: string
  name: string
  type: 'text' | 'email' | 'password'
  ariaLabel: string
  value?: string
  onChange?: (nextValue: string) => void
  autoComplete?: string
}

const AuthInputField = ({ label, name, type, ariaLabel, value, onChange, autoComplete }: AuthInputFieldProps) => {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-white/68 sm:mb-2 sm:text-xs">{label}</span>
      <input
        type={type}
        name={name}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange?.(event.target.value)}
        className="w-full rounded-xl border border-ember-200/35 bg-black/30 px-3 py-2 text-[14px] text-white outline-none transition focus:border-ember-300 focus:ring-2 focus:ring-ember-400/45 sm:rounded-md sm:text-sm"
        aria-label={ariaLabel}
      />
    </label>
  )
}

export default AuthInputField
