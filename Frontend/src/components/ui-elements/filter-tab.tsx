type FilterTabProps = {
  label: string
  isActive: boolean
  onClick: () => void
  ariaLabel: string
}

const FilterTab = ({ label, isActive, onClick, ariaLabel }: FilterTabProps) => {
  const activeClassName = isActive ? 'text-ember-300' : 'text-[#8c9098] hover:text-white'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`whitespace-nowrap font-[family-name:var(--font-heading)] text-[16px] font-medium uppercase leading-none tracking-[0.01em] transition md:text-[21px] ${activeClassName}`}
    >
      {label}
    </button>
  )
}

export default FilterTab
