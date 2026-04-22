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
      className={`min-h-[48px] shrink-0 rounded-full border px-3.5 py-2 touch-manipulation font-[family-name:var(--font-heading)] text-[15px] font-semibold uppercase leading-none tracking-[0.02em] transition sm:min-h-0 sm:rounded-none sm:border-transparent sm:px-0 sm:py-0 sm:text-[18px] md:text-[21px] ${
        isActive
          ? 'border-ember-400/45 bg-ember-500/10 shadow-[0_0_0_1px_rgba(244,99,19,0.08)_inset]'
          : 'border-white/10 bg-white/[0.03] sm:bg-transparent'
      } ${activeClassName}`}
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
