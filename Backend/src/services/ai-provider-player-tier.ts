import { type EffectiveMembershipTierCode } from '../lib/membership-tier-policy'

type AiProviderPlayerTier = 'free' | 'basic' | 'premium'

/**
 * Converts SecretWaifuWEB's authenticated product tier into the smaller core
 * queue-routing contract. This value is trusted only because it is derived from
 * server-side membership state after authentication; public request DTOs must
 * never accept or forward a client-supplied provider tier.
 */
const toAiProviderPlayerTier = (tierCode: EffectiveMembershipTierCode): AiProviderPlayerTier => {
  switch (tierCode) {
    case 'free':
    case 'basic':
    case 'premium':
      return tierCode
    case 'admin':
      return 'premium'
    default:
      throw new Error(`Unsupported membership tier for AI provider routing: ${String(tierCode)}`)
  }
}

export { toAiProviderPlayerTier }
export type { AiProviderPlayerTier }
