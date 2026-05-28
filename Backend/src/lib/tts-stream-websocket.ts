import type { Server as HttpServer } from 'node:http'
import { setupTtsStreamGateway } from '../services/tts/tts-stream-gateway'

/**
 * Stable server bootstrap entry point for TTS stream upgrades. Runtime behavior
 * lives in the TTS service layer so the public socket contract can evolve
 * without turning `server.ts` into provider-specific orchestration code.
 */
const setupTtsStreamWebSocketServer = (server: HttpServer) => {
  setupTtsStreamGateway(server)
}

export { setupTtsStreamWebSocketServer }
