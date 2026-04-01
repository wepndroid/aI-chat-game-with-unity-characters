import type { ReactNode } from 'react'

type AdminKpiTone = 'blue' | 'purple' | 'orange' | 'green'

type AdminKpiCardProps = {
  label: string
  value: string
  /** Default secondary line (muted by tone). Ignored when `helperContent` is set. */
  helperText?: string
  /** Custom footer row (e.g. growth indicator). Takes precedence over `helperText`. */
  helperContent?: ReactNode
  tone?: AdminKpiTone
  icon: ReactNode
  /** When set, overrides the default muted label color (e.g. accent for emphasis). */
  labelClassName?: string
}

const toneClassNameMap: Record<AdminKpiTone, string> = {
  blue: 'border-white/10',
  purple: 'border-white/10',
  orange: 'border-ember-600/45',
  green: 'border-white/10'
}

const iconWrapperClassNameMap: Record<AdminKpiTone, string> = {
  blue: 'bg-blue-500/20 text-blue-300',
  purple: 'bg-purple-500/20 text-purple-300',
  orange: 'bg-amber-500/20 text-amber-300',
  green: 'bg-emerald-500/20 text-emerald-300'
}

const helperTextClassNameMap: Record<AdminKpiTone, string> = {
  blue: 'text-emerald-300',
  purple: 'text-[#9aa4ba]',
  orange: 'text-ember-300',
  green: 'text-emerald-300'
}

const AdminKpiCard = ({ label, value, helperText, helperContent, tone = 'blue', icon, labelClassName }: AdminKpiCardProps) => {
  return (
    <article className={`rounded-2xl border bg-gradient-to-r from-[#0d1016]/95 to-[#0c0d10]/95 px-4 py-4 sm:px-6 sm:py-5 ${toneClassNameMap[tone]}`}>
      <div className="flex items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <p
            className={`text-[12px] font-normal uppercase tracking-[0.08em] ${labelClassName ?? 'text-[#7081a2]'}`}
          >
            {label}
          </p>
          <p className="mt-2 font-[family-name:var(--font-heading)] text-[22px] font-normal leading-none text-white sm:text-[26px]">{value}</p>
          {helperContent ? (
            <div className="mt-2">{helperContent}</div>
          ) : helperText ? (
            <p className={`mt-2 text-[12px] font-normal ${helperTextClassNameMap[tone]}`}>{helperText}</p>
          ) : null}
        </div>
        <span className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full ${iconWrapperClassNameMap[tone]}`} aria-hidden="true">
          <span className="size-5">{icon}</span>
        </span>
      </div>
    </article>
  )
}

export default AdminKpiCard
