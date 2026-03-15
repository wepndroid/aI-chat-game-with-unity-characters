type DashboardStatCardProps = {
  value: string
  label: string
  helperText: string
  isEmphasized?: boolean
}

const DashboardStatCard = ({ value, label, helperText, isEmphasized = false }: DashboardStatCardProps) => {
  const borderClassName = isEmphasized ? 'border-ember-300/45 bg-ember-500/10' : 'border-white/10 bg-[#131112]'
  const valueClassName = isEmphasized ? 'text-ember-200' : 'text-white'

  return (
    <article className={`rounded-xl border p-4 ${borderClassName}`}>
      <p className={`font-[family-name:var(--font-heading)] text-[27px] font-normal italic leading-none ${valueClassName}`}>{value}</p>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/85">{label}</p>
      <p className="mt-1 text-[11px] text-white/55">{helperText}</p>
    </article>
  )
}

export default DashboardStatCard
