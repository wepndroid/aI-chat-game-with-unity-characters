import 'dotenv/config'
import { hydrateApiKeysFromDatabase } from './lib/runtime-env-hydrate'

const parsedPort = Number.parseInt(process.env.PORT ?? '4000', 10)
const port = Number.isNaN(parsedPort) ? 4000 : parsedPort

const start = async () => {
  await hydrateApiKeysFromDatabase()
  const { default: app } = await import('./app')
  app.listen(port, '127.0.0.1', () => {
    console.log('API server listening on http://127.0.0.1:' + port)
  })
}

void start()
