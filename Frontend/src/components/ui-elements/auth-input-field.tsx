type AuthInputFieldProps = {
  label: string
  name: string
  type: 'text' | 'email' | 'password'
  ariaLabel: string
}

const AuthInputField = ({ label, name, type, ariaLabel }: AuthInputFieldProps) => {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-white/70">{label}</span>
      <input
        type={type}
        name={name}
        className="w-full rounded-md border border-ember-200/35 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-ember-300 focus:ring-2 focus:ring-ember-400/45"
        aria-label={ariaLabel}
      />
    </label>
  )
}

export default AuthInputField
