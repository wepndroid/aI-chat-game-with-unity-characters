import MarketingPlaceholderPage from '@/components/shared/marketing-placeholder-page'

const AccessCodePage = () => {
  return (
    <MarketingPlaceholderPage
      title="Access Code"
      description="Placeholder for legacy-to-new entitlement migration and website code verification tools."
      bulletList={[
        'Use this area to validate migration or promo access codes',
        'Future integration can map access codes to entitlement tiers',
        'Server-side verification endpoints are prepared in the backend layer'
      ]}
      primaryActionLabel="Go To Membership"
      primaryActionHref="/members"
      secondaryActionLabel="Open Support"
      secondaryActionHref="/support"
    />
  )
}

export default AccessCodePage
