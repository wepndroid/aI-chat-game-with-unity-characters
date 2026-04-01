import { redirect } from 'next/navigation'

const SignUpPage = () => {
  redirect('/?openSignUp=1')
}

export default SignUpPage
