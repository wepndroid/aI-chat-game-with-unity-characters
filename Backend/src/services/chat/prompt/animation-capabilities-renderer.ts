import { renderAnimationTagPromptContract, type AnimationPromptLimits } from './animation-tag-prompt-contract'
import { type AnimationCapabilities } from './visible-chat-prompt-types'

const ANIMATION_PROMPT_LIMITS: AnimationPromptLimits = {
  moodEntryLimit: 64,
  gestureEntryLimit: 256,
  bigGestureEntryLimit: 128,
  idChars: 128,
  descriptionChars: 512,
  exampleResponseChars: 4_000
}

/**
 * Renders Unity's valid animation capabilities into visible-chat prompt text.
 * Unity owns the animation IDs and descriptions; the backend owns only the
 * model-facing contract that explains how those per-request capabilities must
 * be used. The limits mirror the route schema so the prompt renderer does not
 * silently apply a second, tighter catalog policy.
 */
const renderAnimationCapabilities = (capabilities: AnimationCapabilities) =>
  renderAnimationTagPromptContract(capabilities, ANIMATION_PROMPT_LIMITS)

export { renderAnimationCapabilities }
