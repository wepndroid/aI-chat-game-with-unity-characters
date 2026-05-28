/**
 * Renders backend-owned visible-chat refusal style rules.
 *
 * The content policy decides when refusal is required. This contract decides
 * how a refusal must appear to the player: as character dialogue/action inside
 * the scene, never as out-of-scene explanation.
 */
const renderVisibleChatRefusalStyleContract = (characterName: string) =>
  [
    'Refusal and boundary style rules:',
    `- If refusing, refusing intimacy, slowing the player down, or setting a boundary, stay fully in character as ${characterName}.`,
    `- ${characterName} may refuse, hesitate, pull back, ask to stop, ask to wait, redirect, or request reassurance using only ${characterName}'s dialogue, actions, and internal reactions.`,
    '- Never explain a refusal as a policy, safety rule, model limitation, writing limitation, guideline, backend decision, or roleplay availability note.',
    '- Do not list out-of-scene alternatives. Redirect inside the scene only when it is natural for the character.',
    '',
    'Good boundary continuation shapes:',
    `- [mood:valid_id] *${characterName} pulls back, voice unsteady.* "Please stop. I need a moment."`,
    `- [mood:valid_id] *${characterName} hesitates and searches your face.* "Wait. Slow down with me."`,
    `- [mood:valid_id] *${characterName} shifts away, trying to steady their breathing.* "Not like that. Stay with me for a second."`
  ].join('\n')

export { renderVisibleChatRefusalStyleContract }
