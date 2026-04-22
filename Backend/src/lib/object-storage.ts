import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Readable } from 'node:stream'

const OBJECT_VRM_REF_PREFIX = 'object://vrm/'
const VRM_OBJECT_KEY_PREFIX = 'vrm/'

type ObjectStorageConfig = {
  bucket: string
  region: string
  endpoint?: string
  forcePathStyle: boolean
  accessKeyId: string
  secretAccessKey: string
}

type ObjectStorageDownloadResult = {
  stream: Readable
  contentType: string
  contentLength: number | null
  eTag: string | null
}

const toOptionalTrimmed = (value: string | undefined) => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

const parseBoolean = (value: string | undefined, defaultValue: boolean) => {
  if (value === undefined) {
    return defaultValue
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false
  }
  return defaultValue
}

const resolveObjectStorageConfig = (): ObjectStorageConfig | null => {
  const bucket = toOptionalTrimmed(process.env.OBJECT_STORAGE_BUCKET)
  const accessKeyId = toOptionalTrimmed(process.env.OBJECT_STORAGE_ACCESS_KEY_ID)
  const secretAccessKey = toOptionalTrimmed(process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY)

  if (!bucket || !accessKeyId || !secretAccessKey) {
    return null
  }

  return {
    bucket,
    region: toOptionalTrimmed(process.env.OBJECT_STORAGE_REGION) ?? 'us-east-1',
    endpoint: toOptionalTrimmed(process.env.OBJECT_STORAGE_ENDPOINT) ?? undefined,
    forcePathStyle: parseBoolean(process.env.OBJECT_STORAGE_FORCE_PATH_STYLE, false),
    accessKeyId,
    secretAccessKey
  }
}

let cachedClient: S3Client | null = null
let cachedConfigKey = ''

const getClientAndConfig = (): { client: S3Client; config: ObjectStorageConfig } => {
  const config = resolveObjectStorageConfig()

  if (!config) {
    throw new Error('Object storage is not configured.')
  }

  const cacheKey = JSON.stringify(config)
  if (!cachedClient || cachedConfigKey !== cacheKey) {
    cachedClient = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      }
    })
    cachedConfigKey = cacheKey
  }

  return { client: cachedClient, config }
}

const sanitizeObjectKey = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('Object storage key is required.')
  }

  const normalized = trimmed.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!/^[A-Za-z0-9._\/-]+$/.test(normalized)) {
    throw new Error('Object storage key contains unsupported characters.')
  }

  return normalized
}

const buildVrmObjectKey = (filename: string) => {
  const sanitizedFile = sanitizeObjectKey(filename).split('/').pop() ?? ''
  if (!sanitizedFile.toLowerCase().endsWith('.vrm')) {
    throw new Error('VRM object key must end with .vrm')
  }
  return `${VRM_OBJECT_KEY_PREFIX}${sanitizedFile}`
}

const buildObjectStorageVrmRef = (objectKey: string) => {
  const sanitized = sanitizeObjectKey(objectKey)
  return `${OBJECT_VRM_REF_PREFIX}${sanitized}`
}

const parseObjectStorageVrmRef = (rawValue: string | null | undefined): string | null => {
  if (!rawValue) {
    return null
  }

  const normalized = rawValue.trim()
  if (!normalized.startsWith(OBJECT_VRM_REF_PREFIX)) {
    return null
  }

  const keyPart = normalized.slice(OBJECT_VRM_REF_PREFIX.length)
  if (!keyPart) {
    return null
  }

  try {
    const objectKey = sanitizeObjectKey(keyPart)
    if (!objectKey.toLowerCase().endsWith('.vrm')) {
      return null
    }
    return objectKey
  } catch {
    return null
  }
}

const isObjectStorageConfigured = () => resolveObjectStorageConfig() !== null

const uploadVrmBufferToObjectStorage = async (input: {
  fileName: string
  fileContent: Buffer
  contentType?: string
}) => {
  const { client, config } = getClientAndConfig()
  const objectKey = buildVrmObjectKey(input.fileName)

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      Body: input.fileContent,
      ContentType: input.contentType || 'model/gltf-binary'
    })
  )

  return {
    objectKey,
    reference: buildObjectStorageVrmRef(objectKey)
  }
}

const downloadVrmObjectFromStorage = async (objectKey: string): Promise<ObjectStorageDownloadResult> => {
  const { client, config } = getClientAndConfig()
  const normalizedKey = sanitizeObjectKey(objectKey)

  const response = await client.send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: normalizedKey
    })
  )

  if (!response.Body) {
    throw new Error('Object storage did not return a response body.')
  }

  let readableBody: Readable
  const responseBody = response.Body as unknown
  if (responseBody instanceof Readable) {
    readableBody = responseBody
  } else if (typeof (responseBody as { transformToWebStream?: unknown }).transformToWebStream === 'function') {
    const webStream = (responseBody as { transformToWebStream: () => ReadableStream<Uint8Array> }).transformToWebStream()
    readableBody = Readable.fromWeb(webStream as any)
  } else if (typeof (responseBody as { pipe?: unknown }).pipe === 'function') {
    readableBody = responseBody as Readable
  } else {
    throw new Error('Object storage returned an unsupported stream type.')
  }

  const contentLength = typeof response.ContentLength === 'number' ? response.ContentLength : null
  const eTag = typeof response.ETag === 'string' ? response.ETag : null

  return {
    stream: readableBody,
    contentType: response.ContentType || 'model/gltf-binary',
    contentLength,
    eTag
  }
}

export {
  buildObjectStorageVrmRef,
  downloadVrmObjectFromStorage,
  isObjectStorageConfigured,
  parseObjectStorageVrmRef,
  uploadVrmBufferToObjectStorage
}
