import RouteAccessGuard from '@/components/shared/route-access-guard'

type UploadVrmLayoutProps = Readonly<{
  children: React.ReactNode
}>

const UploadVrmLayout = ({ children }: UploadVrmLayoutProps) => {
  return <RouteAccessGuard requireVerifiedEmail>{children}</RouteAccessGuard>
}

export default UploadVrmLayout
