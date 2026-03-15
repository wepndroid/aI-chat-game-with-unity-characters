import MarketingPlaceholderPage from '@/components/shared/marketing-placeholder-page'

const ChatFaqPage = () => {
  return (
    <MarketingPlaceholderPage
      title="Chat FAQ"
      description="Answers for account access, Patreon linking, VRM moderation, and game-web integration basics."
      bulletList={[
        'How Patreon linking unlocks gated characters',
        'How long moderation review usually takes',
        'Why some characters are private or pending',
        'How game and website character data stay synchronized'
      ]}
      primaryActionLabel="Browse Characters"
      primaryActionHref="/characters"
      secondaryActionLabel="Open Membership"
      secondaryActionHref="/members"
    />
  )
}

export default ChatFaqPage
