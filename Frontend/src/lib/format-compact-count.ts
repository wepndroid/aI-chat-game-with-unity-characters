const compactCountFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1
})

const formatCompactCount = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return '0'
  }

  return compactCountFormatter.format(Math.round(value))
}

export { formatCompactCount }
