'use client'

import { useAuth } from '@/components/providers/auth-provider'
import { useMaintenance } from '@/components/providers/maintenance-provider'
import { usePathname } from 'next/navigation'

const HIDDEN_PATH_PREFIXES = ['/upload-vrm', '/your-characters', '/account/my-characters', '/members'] as const

const isWorkspaceHiddenPath = (pathname: string | null) => {
  if (!pathname) {
    return false
  }

  return HIDDEN_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

type MaintenanceWorkspaceGateProps = {
  children: React.ReactNode
}

/**
 * Wrap only the main column (not `AccountSideMenu`). When maintenance is active for non-admins on gated
 * routes, children are not rendered; the sidebar remains visible.
 */
const MaintenanceWorkspaceGate = ({ children }: MaintenanceWorkspaceGateProps) => {
  const pathname = usePathname()
  const { sessionUser } = useAuth()
  const { isMaintenanceActive } = useMaintenance()
  const isAdmin = sessionUser?.role === 'ADMIN'

  if (isMaintenanceActive && !isAdmin && isWorkspaceHiddenPath(pathname)) {
    return null
  }

  return <>{children}</>
}

export default MaintenanceWorkspaceGate
