import type { ReactNode } from 'react'

type AdminKpiTone = 'blue' | 'purple' | 'orange' | 'green'

type AdminKpiCardProps = {
  label: string
  value: string
  helperText: string
  tone?: AdminKpiTone
  icon: ReactNode
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

const AdminKpiCard = ({ label, value, helperText, tone = 'blue', icon }: AdminKpiCardProps) => {
  return (
    <article className={`rounded-2xl border bg-gradient-to-r from-[#0d1016]/95 to-[#0c0d10]/95 px-6 py-5 ${toneClassNameMap[tone]}`}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[12px] font-normal uppercase tracking-[0.08em] text-[#7081a2]">{label}</p>
          <p className="mt-2 font-[family-name:var(--font-heading)] text-[26px] font-normal leading-none text-white">{value}</p>
          <p className={`mt-2 text-[12px] font-normal ${helperTextClassNameMap[tone]}`}>{helperText}</p>
        </div>
        <span className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full ${iconWrapperClassNameMap[tone]}`} aria-hidden="true">
          <span className="size-5">{icon}</span>
        </span>
      </div>
    </article>
  )
}

export default AdminKpiCard
