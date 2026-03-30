/** Best-effort display name from an absolute or relative URL path. */
export const lastPathSegmentFromUrl = (url: string): string => {
  const trimmed = url.trim()
  if (!trimmed) {
    return 'file'
  }

  try {
    const path = new URL(trimmed).pathname
    const seg = path.split('/').filter(Boolean).pop()
    return seg ? decodeURIComponent(seg) : 'file'
  } catch {
    const seg = trimmed.split(/[/\\]/).filter(Boolean).pop()
    return seg ? decodeURIComponent(seg) : 'file'
  }
}
