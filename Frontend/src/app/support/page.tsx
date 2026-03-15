import MarketingPlaceholderPage from '@/components/shared/marketing-placeholder-page'

const SupportPage = () => {
  return (
    <MarketingPlaceholderPage
      title="Support"
      description="Support and roadmap page for Patreon users, creators, and administrators."
      bulletList={[ 
        'Open issues related to account access or uploads',
        'Coordinate API contract changes with game integration'
      ]}
      primaryActionLabel="Return Home"
      primaryActionHref="/"
      secondaryActionLabel="View Members"
      secondaryActionHref="/members"
    />
  )
}

export default SupportPage
