type CharacterStatTileProps = {
  icon: string
  value: string
  label: string
}

const CharacterStatTile = ({ icon, value, label }: CharacterStatTileProps) => {
  return (
    <article className="flex h-[92px] flex-col items-center justify-center rounded-md border border-white/10 bg-[#121010]">
      <span className="text-[14px] leading-none text-amber-300/90">{icon}</span>
      <p className="mt-2 font-[family-name:var(--font-heading)] text-[34px] font-semibold leading-none text-white">{value}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">{label}</p>
    </article>
  )
}

export default CharacterStatTile
