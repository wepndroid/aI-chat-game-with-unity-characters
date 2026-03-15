export const slugify = (value: string) => {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export const buildUniqueSlug = (source: string, suffix: string) => {
  const baseSlug = slugify(source)

  if (!baseSlug) {
    return `character-${suffix}`
  }

  return `${baseSlug}-${suffix}`
}
