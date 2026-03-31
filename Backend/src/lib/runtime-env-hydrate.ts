import { applyApiKeysToProcessEnv } from './env-file-sync'
import { getRuntimeAdminSettings } from './runtime-admin-settings'

const hydrateApiKeysFromDatabase = async () => {
  const settings = await getRuntimeAdminSettings()
  applyApiKeysToProcessEnv(settings.apiKeys)
}

export { hydrateApiKeysFromDatabase }
