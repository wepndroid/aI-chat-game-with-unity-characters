import AdminPageShell from '@/components/shared/admin-page-shell'

const GearIcon = () => {
  return (
    <svg viewBox="0 0 24 24" className="size-20" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="2.9" />
      <path d="m19.4 13.3.2-2.6-2.1-.7a5.6 5.6 0 0 0-.7-1.7L18 6.1l-1.8-1.8-2.2 1.2a5.6 5.6 0 0 0-1.7-.7l-.7-2.1h-2.6l-.7 2.1c-.6.1-1.2.4-1.7.7L4.8 4.3 3 6.1l1.2 2.2c-.3.5-.5 1.1-.7 1.7l-2.1.7.2 2.6 2.1.7c.2.6.4 1.2.7 1.7L3 18.9l1.8 1.8 2.2-1.2c.5.3 1.1.5 1.7.7l.7 2.1h2.6l.7-2.1c.6-.2 1.2-.4 1.7-.7l2.2 1.2 1.8-1.8-1.2-2.2c.3-.5.5-1.1.7-1.7l2.1-.7Z" />
    </svg>
  )
}

const GlobalSettingsPage = () => {
  return (
    <AdminPageShell activeKey="global-settings" contentClassName="relative flex min-h-[840px] items-center justify-center px-6 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_52%_34%,rgba(244,99,19,0.09),transparent_40%)]" />

      <div className="relative z-10 flex max-w-[760px] flex-col items-center text-center">
        <span className="text-[#3f4857]" aria-hidden="true">
          <GearIcon />
        </span>
        <h1 className="mt-5 font-[family-name:var(--font-heading)] text-[29px] font-normal leading-none text-white">
          Global Settings
        </h1>
        <p className="mt-4 text-[15px] font-[family-name:var(--font-heading)] font-normal text-[#8193b1]">
          Server configurations, maintenance mode, and API keys are managed here.
        </p>
      </div>
    </AdminPageShell>
  )
}

export default GlobalSettingsPage
