type SearchFieldProps = {
  value: string
  onChange: (value: string) => void
  placeholder: string
  ariaLabel: string
}

const SearchField = ({ value, onChange, placeholder, ariaLabel }: SearchFieldProps) => {
  return (
    <label className="w-full">
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="w-full rounded-md border border-white/20 bg-[#0f1116]/90 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-white/50 focus:border-ember-300 focus:ring-2 focus:ring-ember-400/35"
      />
    </label>
  )
}

export default SearchField
