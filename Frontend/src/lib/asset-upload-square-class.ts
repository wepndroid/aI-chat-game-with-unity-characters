/** Dashed tile shell (border, radius, max width). Use with `aspect-square` when in-flow content establishes height, or with a `pt-[100%]` spacer when all children are absolute. */
export const ASSET_PREVIEW_SURFACE_CLASS =
  'relative w-full max-w-[280px] overflow-hidden rounded-md border border-dashed border-white/20 bg-black/25 transition hover:border-ember-300/65'

/** Shared square tile for VRM + preview on the upload form (same max width and aspect). */
export const ASSET_PREVIEW_SQUARE_CLASS = `${ASSET_PREVIEW_SURFACE_CLASS} aspect-square`
