import { apiPostFormData } from '@/lib/api-client'

type ImageGenerationMode = 'txt2img' | 'img2img' | 'pose' | 'prompt-pose'

type ImageGenerationParameters = Record<string, unknown>

type ImageGenerationTestResponse = {
  data: {
    mode: ImageGenerationMode
    imageCount: number
    images: string[]
    firstImageBase64: string | null
    info: unknown
    parameters: ImageGenerationParameters
  }
}

const testImageGeneration = async (formData: FormData) => {
  return apiPostFormData<ImageGenerationTestResponse>('/admin/image-generation/test', formData, 300000)
}

export type { ImageGenerationMode, ImageGenerationParameters, ImageGenerationTestResponse }
export { testImageGeneration }
