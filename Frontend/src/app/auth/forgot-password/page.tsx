import MarketingPlaceholderPage from '@/components/shared/marketing-placeholder-page'

const ForgotPasswordPage = () => {
  return (
    <MarketingPlaceholderPage
      title="Forgot Password"
      description="Password reset UI placeholder for the upcoming authentication milestone."
      bulletList={[
        'Submit your e-mail to receive a reset link',
        'Token verification and secure password update will be handled server-side',
        'Audit log entries can be added for security events'
      ]}
      primaryActionLabel="Back To Home"
      primaryActionHref="/"
      secondaryActionLabel="Sign In"
      secondaryActionHref="/"
    />
  )
}

export default ForgotPasswordPage
