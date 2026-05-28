import fs from 'node:fs'
import path from 'node:path'

const uploadsRoot = path.join(process.cwd(), 'uploads')
const uploadPathPrefix = '/uploads/'

const uploadFolders = {
  avatars: 'avatars',
  communityVrms: 'community-vrms',
  officialVrms: 'official-vrms',
  poses: 'poses',
  thumbnails: 'thumbnails',
  voiceClips: 'voice-clips'
} as const

type UploadFolder = (typeof uploadFolders)[keyof typeof uploadFolders]

const normalizeUploadRelativePath = (value: string | null | undefined) => {
  const trimmed = value?.trim()
  if (!trimmed) {
    return null
  }

  const withForwardSlashes = trimmed.replace(/\\/g, '/').replace(/^\/+/, '')
  const rawSegments = withForwardSlashes.split('/').filter(Boolean)
  const segments: string[] = []

  try {
    for (const rawSegment of rawSegments) {
      const segment = decodeURIComponent(rawSegment)
      if (!segment || segment === '.' || segment === '..' || segment.includes('/') || segment.includes('\\')) {
        return null
      }
      segments.push(segment)
    }
  } catch {
    return null
  }

  if (segments.length === 0) {
    return null
  }

  const resolvedRoot = path.resolve(uploadsRoot)
  const targetPath = path.resolve(path.join(uploadsRoot, ...segments))
  const relativeToRoot = path.relative(resolvedRoot, targetPath)

  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    return null
  }

  return relativeToRoot
}

const ensureUploadFolder = (folder: UploadFolder) => {
  const absolutePath = path.join(uploadsRoot, folder)
  fs.mkdirSync(absolutePath, { recursive: true })
  return absolutePath
}

const ensureUploadFolders = (folders: UploadFolder[]) => {
  for (const folder of folders) {
    ensureUploadFolder(folder)
  }
}

const resolveUploadPath = (relativePath: string | null | undefined) => {
  const normalizedRelativePath = normalizeUploadRelativePath(relativePath)
  if (!normalizedRelativePath) {
    return null
  }

  return path.resolve(path.join(uploadsRoot, normalizedRelativePath))
}

const getUploadRelativePathFromUrl = (rawUrl: string | null | undefined) => {
  const trimmed = rawUrl?.trim()
  if (!trimmed) {
    return null
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }

  const uploadPrefixIndex = parsed.pathname.indexOf(uploadPathPrefix)
  if (uploadPrefixIndex < 0) {
    return null
  }

  return normalizeUploadRelativePath(parsed.pathname.slice(uploadPrefixIndex + uploadPathPrefix.length))
}

const getUploadRelativePathFromAbsolutePath = (absolutePath: string) => {
  const resolvedRoot = path.resolve(uploadsRoot)
  const resolvedTarget = path.resolve(absolutePath)
  const relativeToRoot = path.relative(resolvedRoot, resolvedTarget)

  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    return null
  }

  return normalizeUploadRelativePath(relativeToRoot)
}

const buildUploadUrl = (origin: string, relativePath: string) => {
  return `${origin.replace(/\/+$/, '')}${uploadPathPrefix}${relativePath.replace(/\\/g, '/')}`
}

export {
  buildUploadUrl,
  ensureUploadFolder,
  ensureUploadFolders,
  getUploadRelativePathFromAbsolutePath,
  getUploadRelativePathFromUrl,
  normalizeUploadRelativePath,
  resolveUploadPath,
  uploadFolders,
  uploadsRoot
}
