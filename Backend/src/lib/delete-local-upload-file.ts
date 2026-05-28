import fs from 'node:fs/promises'

import { isDevLoopbackSelfHostedUpload, isTrustedSelfHostedAssetUrl } from './character-asset-url'
import { deleteUploadedVoiceProviderRegistration } from './tts-provider-uploaded-voice-alias'
import { getUploadRelativePathFromUrl, resolveUploadPath } from './upload-paths'

const isDeletableSelfHostedUploadUrl = (rawUrl: string) => {
  return isTrustedSelfHostedAssetUrl(rawUrl) || isDevLoopbackSelfHostedUpload(rawUrl)
}

/**
 * Deletes a file under `uploads/` when the URL is a trusted self-hosted asset (same origin + /uploads/).
 * In development, loopback URLs under `/uploads/` are also accepted (same rules as asset validation).
 * No-ops for external URLs or missing files. Rejects path traversal.
 */
const tryDeleteTrustedUploadFile = async (rawUrl: string | null | undefined) => {
  const trimmed = rawUrl?.trim()
  if (!trimmed) {
    return
  }

  if (!isDeletableSelfHostedUploadUrl(trimmed)) {
    return
  }

  const relativePath = getUploadRelativePathFromUrl(trimmed)
  const targetPath = resolveUploadPath(relativePath)
  if (!targetPath) {
    return
  }

  let bFileDeletedOrMissing = false
  try {
    await fs.unlink(targetPath)
    bFileDeletedOrMissing = true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      throw error
    }
    bFileDeletedOrMissing = true
  }

  if (bFileDeletedOrMissing && relativePath?.replace(/\\/g, '/').startsWith('voice-clips/')) {
    await deleteUploadedVoiceProviderRegistration(relativePath)
  }
}

export { tryDeleteTrustedUploadFile }
