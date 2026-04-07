type FilterTabProps = {
  label: string
  /** Shown below `sm` when set; full `label` from `sm` up (saves horizontal space on phones). */
  shortLabel?: string
  isActive: boolean
  onClick: () => void
  ariaLabel: string
}

const FilterTab = ({ label, shortLabel, isActive, onClick, ariaLabel }: FilterTabProps) => {
  const activeClassName = isActive ? 'text-ember-300' : 'text-[#8c9098] hover:text-white'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`min-h-[44px] min-w-[44px] shrink-0 touch-manipulation px-1 font-[family-name:var(--font-heading)] text-[15px] font-medium uppercase leading-none tracking-[0.01em] transition sm:min-h-0 sm:min-w-0 sm:px-0 sm:text-[18px] md:text-[21px] ${activeClassName}`}
    >
      {shortLabel ? (
        <>
          <span className="sm:hidden">{shortLabel}</span>
          <span className="hidden sm:inline">{label}</span>
        </>
      ) : (
        label
      )}
    </button>
  )
}

export default FilterTab
