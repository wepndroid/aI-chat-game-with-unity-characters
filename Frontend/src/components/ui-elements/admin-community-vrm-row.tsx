import AdminVrmStatusPill, { type AdminVrmVisibilityStatus } from '@/components/ui-elements/admin-vrm-status-pill'

type AdminCommunityVrmRecord = {
  id: string
  code: string
  name: string
  uploader: string
  hearts: number
  chats: number
  status: AdminVrmVisibilityStatus
}

type AdminCommunityVrmRowProps = {
  vrmRecord: AdminCommunityVrmRecord
}

const HeartIcon = () => {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor">
      <path d="M12 20s-6.7-4.2-8.8-7.7a5.1 5.1 0 0 1 8.1-6 5.1 5.1 0 0 1 8.2 6C18.7 15.8 12 20 12 20Z" />
    </svg>
  )
}

const ChatIcon = () => {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor">
      <path d="M5.5 5.7h13a2.8 2.8 0 0 1 2.8 2.8v6.4a2.8 2.8 0 0 1-2.8 2.8h-7l-3.6 3.1v-3.1H5.5a2.8 2.8 0 0 1-2.8-2.8V8.5a2.8 2.8 0 0 1 2.8-2.8Z" />
    </svg>
  )
}

const EyeIcon = () => {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M2.7 12s3.5-6 9.3-6 9.3 6 9.3 6-3.5 6-9.3 6-9.3-6-9.3-6Z" />
      <circle cx="12" cy="12" r="2.2" />
    </svg>
  )
}

const SettingsIcon = () => {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="12" cy="12" r="2.4" />
      <path d="m19 12.7.1-1.4-1.9-.7c-.1-.4-.3-.8-.5-1.2l1.1-1.8-1-1-1.8 1a4.8 4.8 0 0 0-1.2-.5l-.7-1.9h-1.4l-.7 1.9c-.4.1-.8.3-1.2.5l-1.8-1-1 1 1.1 1.8c-.2.4-.4.8-.5 1.2l-1.9.7.1 1.4 1.9.7c.1.4.3.8.5 1.2l-1.1 1.8 1 1 1.8-1.1c.4.3.8.4 1.2.5l.7 2h1.4l.7-2c.4-.1.8-.2 1.2-.5l1.8 1.1 1-1-1.1-1.8c.3-.4.4-.8.5-1.2l1.9-.7Z" />
    </svg>
  )
}

const RemoveIcon = () => {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="12" cy="12" r="8.6" />
      <path d="M9 9l6 6M15 9l-6 6" strokeLinecap="round" />
    </svg>
  )
}

const AdminCommunityVrmRow = ({ vrmRecord }: AdminCommunityVrmRowProps) => {
  return (
    <tr className="border-t border-white/10">
      <td className="px-4 py-4 align-middle">
        <div className="inline-flex items-center gap-3">
          <span className="inline-flex size-10 shrink-0 rounded-md border border-white/10 bg-[#1d2736]" aria-hidden="true" />
          <div>
            <p className="font-[family-name:var(--font-heading)] text-[17px] font-normal leading-none text-white">{vrmRecord.name}</p>
            <p className="mt-1 text-sm text-[#6f809d]">{vrmRecord.code}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-4 align-middle text-[15px] font-[family-name:var(--font-heading)] font-normal text-[#9ca9c2]">{vrmRecord.uploader}</td>
      <td className="px-4 py-4 align-middle">
        <div className="inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1 text-xs font-normal text-pink-400">
            <HeartIcon />
            {vrmRecord.hearts}
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-normal text-[#a8b6d0]">
            <ChatIcon />
            {vrmRecord.chats}
          </span>
        </div>
      </td>
      <td className="px-4 py-4 align-middle">
        <AdminVrmStatusPill status={vrmRecord.status} />
      </td>
      <td className="px-4 py-4 align-middle">
        <div className="inline-flex items-center gap-2">
          <button
            type="button"
            className="inline-flex size-8 items-center justify-center rounded-md border border-transparent text-[#8c99b0] transition hover:border-white/15 hover:bg-white/5 hover:text-white"
            aria-label={`Preview ${vrmRecord.name}`}
          >
            <EyeIcon />
          </button>
          <button
            type="button"
            className="inline-flex size-8 items-center justify-center rounded-md border border-transparent text-[#8c99b0] transition hover:border-white/15 hover:bg-white/5 hover:text-white"
            aria-label={`Edit ${vrmRecord.name}`}
          >
            <SettingsIcon />
          </button>
          <button
            type="button"
            className="inline-flex size-8 items-center justify-center rounded-md border border-transparent text-[#8c99b0] transition hover:border-rose-500/35 hover:bg-rose-500/10 hover:text-rose-300"
            aria-label={`Remove ${vrmRecord.name}`}
          >
            <RemoveIcon />
          </button>
        </div>
      </td>
    </tr>
  )
}

export default AdminCommunityVrmRow
export type { AdminCommunityVrmRecord }
