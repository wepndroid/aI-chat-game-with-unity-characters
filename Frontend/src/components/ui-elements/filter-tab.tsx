type FilterTabProps = {
  label: string
  isActive: boolean
  onClick: () => void
  ariaLabel: string
}

const FilterTab = ({ label, isActive, onClick, ariaLabel }: FilterTabProps) => {
  const activeClassName = isActive ? 'text-ember-300' : 'text-white/70 hover:text-white'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`text-xs font-semibold uppercase tracking-[0.11em] transition ${activeClassName}`}
    >
      {label}
    </button>
  )
}

export default FilterTab
