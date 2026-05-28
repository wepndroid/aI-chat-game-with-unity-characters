import { apiDelete, apiPatch, apiPostFormData } from '@/lib/api-client'

const uploadUserAvatar = async (file: File) => {
  const formData = new FormData()
  formData.set('avatar', file)
  return apiPostFormData<{ data: { avatarUrl: string } }>('/users/me/avatar', formData)
}

const removeUserAvatar = async () => {
  return apiDelete<{ data: { avatarUrl: string | null } }>('/users/me/avatar')
}

const updateMyPlayerName = async (playerName: string) => {
  return apiPatch<{ data: { id: string; username: string; player_name: string; updated_at: string } }>('/users/me/profile', {
    player_name: playerName
  })
}

export { removeUserAvatar, updateMyPlayerName, uploadUserAvatar }
