/* eslint-disable @next/next/no-img-element */
import AdminOfficialVrmStatusPill, { type AdminOfficialVrmStatus } from '@/components/ui-elements/admin-official-vrm-status-pill'
import { AdminVrmMetricHeartIcon, AdminVrmMetricViewsIcon } from '@/components/ui-elements/admin-vrm-metric-icons'
import Link from 'next/link'

type AdminOfficialVrmRecord = {
  id: string
  slug: string
  code: string
  name: string
  tagline: string
  hearts: string
  views: string
  status: AdminOfficialVrmStatus
  releaseDate: string
  previewImageUrl: string | null
}

type AdminOfficialVrmRowProps = {
  vrmRecord: AdminOfficialVrmRecord
  isBusy?: boolean
  /** Opens parent confirmation UI; parent runs permanent delete only after admin confirms. */
  onDeleteRequest?: (characterId: string, characterName: string) => void
}

const StarIcon = () => {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m12 4.6 2 4.2 4.6.7-3.4 3.2.8 4.7-4-2.1-4 2.1.8-4.7-3.4-3.2 4.6-.7 2-4.2Z" />
    </svg>
  )
}

const EditIcon = () => {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M4.8 15.6 15.9 4.5a2 2 0 0 1 2.8 0l.8.8a2 2 0 0 1 0 2.8L8.4 19.2l-4 .5.4-4.1Z" />
    </svg>
  )
}

const EyeIcon = () => {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M2.7 12s3.5-6 9.3-6 9.3 6 9.3 6-3.5 6-9.3 6-9.3-6-9.3-6Z" />
      <circle cx="12" cy="12" r="2.2" />
    </svg>
  )
}

const TrashIcon = () => {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M4.8 6.8h14.4M9.3 6.8V5.4h5.4v1.4M8.4 9.3v8.4M12 9.3v8.4M15.6 9.3v8.4M6.8 6.8l.6 12a1.7 1.7 0 0 0 1.7 1.6h5.8a1.7 1.7 0 0 0 1.7-1.6l.6-12" />
    </svg>
  )
}

const AdminOfficialVrmRow = ({ vrmRecord, isBusy = false, onDeleteRequest }: AdminOfficialVrmRowProps) => {
  return (
    <tr className="border-t border-white/10">
      <td className="px-4 py-4 align-middle">
        <div className="inline-flex items-center gap-3">
          {vrmRecord.previewImageUrl ? (
            <img
              src={vrmRecord.previewImageUrl}
              alt=""
              className="size-10 shrink-0 rounded-md border border-white/10 object-cover object-top"
            />
          ) : (
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-ember-400/30 bg-gradient-to-br from-ember-300 to-ember-500 text-white" aria-hidden="true">
              <StarIcon />
            </span>
          )}
          <div>
            <p className="font-[family-name:var(--font-heading)] text-[17px] font-normal leading-none text-white">{vrmRecord.name}</p>
            <p className="mt-1 text-sm text-[#6f809d]">{vrmRecord.code}</p>
          </div>
        </div>
      </td>

      <td className="max-w-[min(100vw,280px)] px-3 py-4 align-middle sm:max-w-none sm:px-4">
        <span className="inline-flex max-w-full items-center break-words rounded-full border border-ember-400/55 bg-ember-500/10 px-2.5 py-1 text-[10px] font-normal uppercase tracking-[0.05em] text-ember-300 sm:px-3">
          {vrmRecord.tagline}
        </span>
      </td>

      <td className="px-4 py-4 align-middle">
        <div className="inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1 text-xs font-normal text-pink-400">
            <AdminVrmMetricHeartIcon />
            {vrmRecord.hearts}
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-normal text-[#a8b6d0]" title="Views">
            <AdminVrmMetricViewsIcon />
            {vrmRecord.views}
          </span>
        </div>
      </td>

      <td className="px-4 py-4 align-middle">
        <AdminOfficialVrmStatusPill status={vrmRecord.status} />
      </td>

      <td className="px-4 py-4 align-middle text-base text-[#9cb0cc]">{vrmRecord.releaseDate}</td>

      <td className="px-4 py-4 align-middle">
        <div className="inline-flex items-center gap-2">
          <Link
            href={`/upload-vrm?edit=${encodeURIComponent(vrmRecord.id)}`}
            className="inline-flex size-9 items-center justify-center rounded-lg text-[#8c99b0] transition hover:bg-white/5 hover:text-white"
            aria-label={`Edit ${vrmRecord.name}`}
          >
            <EditIcon />
          </Link>
          <Link
            href={`/characters/${encodeURIComponent(vrmRecord.slug)}`}
            className="inline-flex size-9 items-center justify-center rounded-lg text-[#8c99b0] transition hover:bg-white/5 hover:text-white"
            aria-label={`Open gallery page for ${vrmRecord.name}`}
          >
            <EyeIcon />
          </Link>
          {onDeleteRequest ? (
            <button
              type="button"
              onClick={() => onDeleteRequest(vrmRecord.id, vrmRecord.name)}
              disabled={isBusy}
              className="inline-flex size-9 items-center justify-center rounded-lg text-[#8c99b0] transition hover:bg-rose-500/10 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-[#8c99b0]"
              aria-haspopup="dialog"
              aria-label={`Remove ${vrmRecord.name} — opens confirmation`}
            >
              <TrashIcon />
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  )
}

export default AdminOfficialVrmRow
export type { AdminOfficialVrmRecord }
