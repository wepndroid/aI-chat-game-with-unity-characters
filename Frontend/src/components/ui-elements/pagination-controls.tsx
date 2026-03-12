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

    if (currentPage >= totalPages - 2) {
      return [totalPages - 2, totalPages - 1, totalPages]
    }

    return [currentPage - 1, currentPage, currentPage + 1]
  }

  const visiblePages = getVisiblePages()
  const showLeadingEllipsis = visiblePages[0] > 1
  const showTrailingEllipsis = visiblePages[visiblePages.length - 1] < totalPages

  const baseClassName =
    'inline-flex h-7 min-w-7 items-center justify-center rounded border text-xs font-semibold transition'

  const getPageButtonClassName = (page: number) => {
    if (page === currentPage) {
      return `${baseClassName} border-ember-400 bg-ember-500/35 text-white`
    }

    return `${baseClassName} border-white/25 bg-black/30 px-2 text-white/80 hover:border-ember-300 hover:text-white`
  }

  return (
    <div className="flex items-center gap-1.5">
      {visiblePages.map((page) => (
        <button key={page} type="button" onClick={() => onPageChange(page)} className={getPageButtonClassName(page)} aria-label={`Go to page ${page}`}>
          {page}
        </button>
      ))}

      {showTrailingEllipsis ? (
        <>
          <span className="px-1 text-xs text-white/70">...</span>
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

      {showLeadingEllipsis ? <span className="hidden" aria-hidden="true">...</span> : null}
    </div>
  )
}

export default PaginationControls
