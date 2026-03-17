import RouteAccessGuard from '@/components/shared/route-access-guard'

type YourCharactersLayoutProps = Readonly<{
  children: React.ReactNode
}>

const YourCharactersLayout = ({ children }: YourCharactersLayoutProps) => {
  return <RouteAccessGuard>{children}</RouteAccessGuard>
}

export default YourCharactersLayout
