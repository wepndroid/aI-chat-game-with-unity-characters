'use client'

import { useAuth } from '@/components/providers/auth-provider'
import AuthInputField from '@/components/ui-elements/auth-input-field'
import { getGoogleOauthStartUrl, isGoogleOauthEnabled } from '@/lib/auth-api'
import { AUTH_OPEN_SIGN_IN_MODAL_EVENT } from '@/lib/auth-events'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

const SignUpPage = () => {
  const googleOauthEnabled = isGoogleOauthEnabled()
  const { registerUser } = useAuth()
  const router = useRouter()
  const [usernameInputValue, setUsernameInputValue] = useState('')
  const [emailInputValue, setEmailInputValue] = useState('')
  const [passwordInputValue, setPasswordInputValue] = useState('')
  const [confirmPasswordInputValue, setConfirmPasswordInputValue] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSignUpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (passwordInputValue.trim() !== confirmPasswordInputValue.trim()) {
      setErrorMessage('Passwords do not match.')
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    const registrationResult = await registerUser({
      username: usernameInputValue,
      email: emailInputValue,
      password: passwordInputValue
    })

    if (!registrationResult.success) {
      setErrorMessage(registrationResult.message ?? 'Unable to create account.')
      setIsSubmitting(false)
      return
    }

    setIsSubmitting(false)
    router.replace('/profile')
  }

  const handleOpenSignInModal = () => {
    router.push('/')
    window.dispatchEvent(new Event(AUTH_OPEN_SIGN_IN_MODAL_EVENT))
  }

  const handleSignInWithGoogle = () => {
    if (!googleOauthEnabled) {
      setErrorMessage('Google OAuth is not enabled yet.')
      return
    }

    window.location.assign(getGoogleOauthStartUrl('/profile'))
  }

  return (
    <main className="relative overflow-hidden bg-[#030303] text-white">
      <section className="relative min-h-[calc(100vh-140px)] border-b border-white/10 px-5 py-10 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(244,99,19,0.15),transparent_34%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:22px_22px] opacity-45" />

        <div className="relative z-10 mx-auto w-full max-w-md pt-24">
          <div className="rounded-2xl border border-ember-300/20 bg-[#171411]/95 p-6 shadow-ember backdrop-blur md:p-8">
            <h1 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold uppercase tracking-wider text-white">
              Create Account
            </h1>
            <p className="mt-3 text-sm text-white/70">
              Register a new account to access your profile and character management.
            </p>

            <form className="mt-5 space-y-4" aria-label="Sign up form" onSubmit={handleSignUpSubmit}>
              <AuthInputField
                label="Username"
                name="username"
                type="text"
                ariaLabel="Username"
                value={usernameInputValue}
                onChange={setUsernameInputValue}
                autoComplete="username"
              />
              <AuthInputField
                label="Email Address"
                name="email"
                type="email"
                ariaLabel="Email address"
                value={emailInputValue}
                onChange={setEmailInputValue}
                autoComplete="email"
              />
              <AuthInputField
                label="Password"
                name="password"
                type="password"
                ariaLabel="Password"
                value={passwordInputValue}
                onChange={setPasswordInputValue}
                autoComplete="new-password"
              />
              <AuthInputField
                label="Confirm Password"
                name="confirm-password"
                type="password"
                ariaLabel="Confirm password"
                value={confirmPasswordInputValue}
                onChange={setConfirmPasswordInputValue}
                autoComplete="new-password"
              />

              {errorMessage ? (
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-rose-300">{errorMessage}</p>
              ) : null}

              <button
                type="submit"
                className="w-full rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-4 py-2.5 text-sm font-bold uppercase tracking-[0.12em] text-black transition hover:brightness-110"
                aria-label="Create account"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Creating Account...' : 'Sign Up'}
              </button>

              {googleOauthEnabled ? (
                <button
                  type="button"
                  onClick={handleSignInWithGoogle}
                  className="w-full rounded-md border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold uppercase tracking-[0.08em] text-white transition hover:border-ember-300 hover:text-ember-200"
                  aria-label="Sign up with Google"
                >
                  Sign Up with Google
                </button>
              ) : null}
            </form>

            <p className="mt-4 text-xs text-white/70">
              Already have an account?{' '}
              <button
                type="button"
                onClick={handleOpenSignInModal}
                className="font-semibold text-ember-300 transition hover:text-ember-200"
                aria-label="Open sign in modal"
              >
                Sign In
              </button>
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}

export default SignUpPage
