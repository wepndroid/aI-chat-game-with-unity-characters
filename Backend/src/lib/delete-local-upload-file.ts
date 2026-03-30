import fs from 'node:fs/promises'
import path from 'node:path'

import { isTrustedSelfHostedAssetUrl } from './character-asset-url'

const uploadsRoot = path.join(process.cwd(), 'uploads')

/**
 * Deletes a file under `uploads/` when the URL is a trusted self-hosted asset (same origin + /uploads/).
 * No-ops for external URLs or missing files. Rejects path traversal.
 */
const tryDeleteTrustedUploadFile = async (rawUrl: string | null | undefined) => {
  const trimmed = rawUrl?.trim()
  if (!trimmed) {
    return
  }

  if (!isTrustedSelfHostedAssetUrl(trimmed)) {
    return
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return
  }

  const baseName = path.basename(parsed.pathname)
  if (!baseName || baseName === '.' || baseName === '..') {
    return
  }

  const resolvedRoot = path.resolve(uploadsRoot)
  const targetPath = path.resolve(path.join(uploadsRoot, baseName))
  const relativeToRoot = path.relative(resolvedRoot, targetPath)

  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    return
  }

  try {
    await fs.unlink(targetPath)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      throw error
    }
  }
}

export { tryDeleteTrustedUploadFile }
