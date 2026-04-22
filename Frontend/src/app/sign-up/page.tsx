import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  },
  alternates: {
    canonical: '/sign-up'
  }
}

const SignUpPage = () => {
  redirect('/?openSignUp=1')
}

export default SignUpPage
