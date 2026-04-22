type PaginationControlsProps = {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
}

const PaginationControls = ({ currentPage, totalPages, onPageChange }: PaginationControlsProps) => {
  if (totalPages <= 1) {
    return null
  }

  const getVisiblePages = () => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, index) => index + 1)
    }

    if (currentPage <= 3) {
      return [1, 2, 3]
    }

    // Only pin to the last three page numbers on the final two pages.
    // Using `totalPages - 2` here wrongly included e.g. page 4 of 6, which hid 1–3 entirely.
    if (currentPage >= totalPages - 1) {
      return [totalPages - 2, totalPages - 1, totalPages]
    }

    return [currentPage - 1, currentPage, currentPage + 1]
  }

  const visiblePages = getVisiblePages()
  const firstVisible = visiblePages[0] ?? 1
  const lastVisible = visiblePages[visiblePages.length - 1] ?? 1
  const showLeadingJump = firstVisible > 1
  const showLeadingGapEllipsis = firstVisible > 2
  const showTrailingGapEllipsis = lastVisible < totalPages - 1
  const showTrailingLast = lastVisible < totalPages

  const baseClassName =
    'inline-flex min-h-[42px] min-w-[42px] items-center justify-center rounded-xl border px-2 text-[14px] font-semibold transition sm:min-h-7 sm:min-w-7 sm:rounded sm:px-0 sm:text-xs'

  const getPageButtonClassName = (page: number) => {
    if (page === currentPage) {
      return `${baseClassName} border-ember-400 bg-ember-500/35 text-white`
    }

    return `${baseClassName} border-white/25 bg-black/30 px-2 text-white/80 hover:border-ember-300 hover:text-white`
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-1.5">
      {showLeadingJump ? (
        <>
          <button type="button" onClick={() => onPageChange(1)} className={getPageButtonClassName(1)} aria-label="Go to page 1">
            1
          </button>
          {showLeadingGapEllipsis ? <span className="px-1 text-[14px] text-white/70 sm:text-xs">...</span> : null}
        </>
      ) : null}

      {visiblePages.map((page) => (
        <button key={page} type="button" onClick={() => onPageChange(page)} className={getPageButtonClassName(page)} aria-label={`Go to page ${page}`}>
          {page}
        </button>
      ))}

      {showTrailingLast ? (
        <>
          {showTrailingGapEllipsis ? <span className="px-1 text-[14px] text-white/70 sm:text-xs">...</span> : null}
          <button
            type="button"
            onClick={() => onPageChange(totalPages)}
            className={getPageButtonClassName(totalPages)}
            aria-label={`Go to page ${totalPages}`}
          >
            {totalPages}
          </button>
        </>
      ) : null}
    </div>
  )
}

export default PaginationControls
