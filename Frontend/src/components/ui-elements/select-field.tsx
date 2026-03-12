type SelectFieldOption = {
  value: string
  label: string
}

type SelectFieldProps = {
  label: string
  value: string
  options: SelectFieldOption[]
  onChange: (value: string) => void
  ariaLabel: string
}

const SelectField = ({ label, value, options, onChange, ariaLabel }: SelectFieldProps) => {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/55">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
        className="h-11 rounded-md border border-white/20 bg-[#0f1116]/90 px-3 text-sm text-white outline-none transition focus:border-ember-300 focus:ring-2 focus:ring-ember-400/35"
      >
        {options.map((optionItem) => (
          <option key={optionItem.value} value={optionItem.value} className="bg-[#111216] text-white">
            {optionItem.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export default SelectField
