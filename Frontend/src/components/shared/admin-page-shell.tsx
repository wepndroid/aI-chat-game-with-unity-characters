import AdminSidebar, { type AdminSidebarKey } from '@/components/shared/admin-sidebar'
import type { ReactNode } from 'react'

type AdminPageShellProps = {
  activeKey: AdminSidebarKey
  children: ReactNode
  contentClassName?: string
}

const AdminPageShell = ({ activeKey, children, contentClassName = 'p-5 sm:p-6 lg:p-10' }: AdminPageShellProps) => {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#030303] px-2 sm:px-4 lg:px-6 pt-24">
      <div className="mx-auto w-full max-w-[1540px]">
        <section className="relative overflow-hidden rounded-[22px] border border-white/10 bg-[#06080b]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_0%,rgba(244,99,19,0.08),transparent_38%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:18px_18px] opacity-[0.22]" />

          <div className="relative grid min-h-[840px] xl:grid-cols-[250px_1fr]">
            <AdminSidebar activeKey={activeKey} />
            <div className={contentClassName}>{children}</div>
          </div>
        </section>
      </div>
    </main>
  )
}

export default AdminPageShell
