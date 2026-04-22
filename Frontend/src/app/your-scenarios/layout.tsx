import type { Metadata } from 'next'
import RouteAccessGuard from '@/components/shared/route-access-guard'

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  }
}

type YourScenariosLayoutProps = Readonly<{
  children: React.ReactNode
}>

const YourScenariosLayout = ({ children }: YourScenariosLayoutProps) => {
  return <RouteAccessGuard requireVerifiedEmail>{children}</RouteAccessGuard>
}

export default YourScenariosLayout
