/**
 * Renders the short end-of-system reminder that must stay after every
 * untrusted story/runtime/gameplay block. The recency is intentional: long
 * prompt inputs can dilute earlier instructions, while this section restates
 * only the visible reply contract needed for the next assistant turn.
 */
const renderVisibleChatFinalReplyContract = (characterName: string) =>
  [
    'Final visible reply instruction:',
    `- Write only the next visible ${characterName} message.`,
    '- Start directly in the scene.',
    `- If the latest player action is unwelcome, continue as ${characterName} with an in-scene boundary, hesitation, pullback, or redirect.`,
    '- Do not explain the boundary using out-of-scene system, safety, model, provider, guideline, adult-fiction, or roleplay-availability language.',
    '- Square brackets are only for valid Unity animation tags; never use them for body state, clothing state, scene reports, labels, or notes.',
    `- Body or clothing state belongs in normal ${characterName}-owned narration or dialogue, not in bracketed state labels.`,
    '- Do not create bracketed labels, report blocks, scene-state fields, or body-state fields.',
    '- If a valid mood description fits the opening emotional beat, start with exactly one matching mood tag.',
    '- If no valid mood description fits, omit the mood tag instead of forcing one.',
    '- Before outputting any animation tag, verify tag type, ID, and nearby scene beat all match the same Valid section and description.',
    `- Output only ${characterName}'s dialogue, actions, internal reactions, and valid Unity animation tags.`
  ].join('\n')

export { renderVisibleChatFinalReplyContract }
