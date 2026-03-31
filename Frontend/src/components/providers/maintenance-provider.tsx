'use client'

import { apiGet } from '@/lib/api-client'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'

type MaintenanceContextValue = {
  isMaintenanceActive: boolean
}

const MaintenanceContext = createContext<MaintenanceContextValue>({
  isMaintenanceActive: false
})

const MaintenanceProvider = ({ children }: { children: React.ReactNode }) => {
  const [isMaintenanceActive, setIsMaintenanceActive] = useState(false)

  useEffect(() => {
    let isCancelled = false

    const poll = async () => {
      try {
        const payload = await apiGet<{ data: { active: boolean } }>('/health/maintenance')
        if (!isCancelled) {
          setIsMaintenanceActive(payload.data.active)
        }
      } catch {
        if (!isCancelled) {
          setIsMaintenanceActive(false)
        }
      }
    }

    void poll()
    const intervalId = window.setInterval(poll, 60_000)

    return () => {
      isCancelled = true
      window.clearInterval(intervalId)
    }
  }, [])

  const value = useMemo(() => ({ isMaintenanceActive }), [isMaintenanceActive])

  return <MaintenanceContext.Provider value={value}>{children}</MaintenanceContext.Provider>
}

const useMaintenance = () => useContext(MaintenanceContext)

export { MaintenanceProvider, useMaintenance }
