import 'dotenv/config'
import app from './app'

const parsedPort = Number.parseInt(process.env.PORT ?? '4000', 10)
const port = Number.isNaN(parsedPort) ? 4000 : parsedPort

app.listen(port, '127.0.0.1', () => {
  console.log('API server listening on http://127.0.0.1:' + port)
})
