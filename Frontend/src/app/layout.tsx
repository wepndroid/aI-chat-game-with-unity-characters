import type { Metadata } from 'next'
import { Barlow_Condensed, Sora } from 'next/font/google'
import './globals.css'

const bodyFont = Sora({
  subsets: ['latin'],
  variable: '--font-body'
})

const headingFont = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-heading'
})

export const metadata: Metadata = {
  title: 'SecretWaifu | Login Home',
  description: 'AI Chat Game platform login and homepage preview'
}

type RootLayoutProps = Readonly<{
  children: React.ReactNode
}>

const RootLayout = ({ children }: RootLayoutProps) => {
  return (
    <html lang="en">
      <body className={`${bodyFont.variable} ${headingFont.variable} bg-[#030303] text-white antialiased`}>
        {children}
      </body>
    </html>
  )
}

export default RootLayout
