'use client'

import { useAuth } from '@/components/providers/auth-provider'
import { useMaintenance } from '@/components/providers/maintenance-provider'
import { PUBLIC_MAINTENANCE_ALERT_TEXT } from '@/lib/maintenance-message'

const MaintenanceBanner = () => {
  const { sessionUser, isAuthLoading } = useAuth()
  const { isMaintenanceActive } = useMaintenance()

  if (isAuthLoading) {
    return null
  }

  const isAdmin = sessionUser?.role === 'ADMIN'

  if (!isMaintenanceActive || isAdmin) {
    return null
  }

  return (
    <div
      className="border-t border-amber-400/30 bg-amber-950/85 px-4 py-2 text-center text-[11px] leading-snug text-amber-50 md:text-xs"
      role="alert"
    >
      {PUBLIC_MAINTENANCE_ALERT_TEXT}
    </div>
  )
}

export default MaintenanceBanner
