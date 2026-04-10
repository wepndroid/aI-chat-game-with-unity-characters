import type { Area } from 'react-easy-crop'

const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image()
    if (url.startsWith('http://') || url.startsWith('https://')) {
      image.crossOrigin = 'anonymous'
    }
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', (event) => reject(event))
    image.src = url
  })

/**
 * Crops the image to the square region from react-easy-crop, optionally downscaling
 * so uploads stay small while matching on-screen framing.
 */
const getCroppedImageBlob = async (
  imageSrc: string,
  pixelCrop: Area,
  options?: { maxOutputEdge?: number; mime?: 'image/jpeg' | 'image/webp'; quality?: number }
): Promise<Blob> => {
  const maxEdge = options?.maxOutputEdge ?? 512
  const mime = options?.mime ?? 'image/jpeg'
  const quality = options?.quality ?? 0.9

  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not create canvas context.')
  }

  let outW = pixelCrop.width
  let outH = pixelCrop.height
  const scale = Math.min(1, maxEdge / Math.max(outW, outH))
  outW = Math.max(1, Math.round(outW * scale))
  outH = Math.max(1, Math.round(outH * scale))

  canvas.width = outW
  canvas.height = outH

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outW,
    outH
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not encode image.'))
          return
        }
        resolve(blob)
      },
      mime,
      quality
    )
  })
}

export { getCroppedImageBlob }
