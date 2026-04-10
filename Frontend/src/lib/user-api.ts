import { apiDelete, apiPostFormData } from '@/lib/api-client'

const uploadUserAvatar = async (file: File) => {
  const formData = new FormData()
  formData.set('avatar', file)
  return apiPostFormData<{ data: { avatarUrl: string } }>('/users/me/avatar', formData)
}

const removeUserAvatar = async () => {
  return apiDelete<{ data: { avatarUrl: string | null } }>('/users/me/avatar')
}

export { removeUserAvatar, uploadUserAvatar }
