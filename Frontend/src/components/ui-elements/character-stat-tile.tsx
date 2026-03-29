import type { ReactNode } from 'react'

type CharacterStatTileProps = {
  icon: ReactNode
  value: string
  label: string
}

const CharacterStatTile = ({ icon, value, label }: CharacterStatTileProps) => {
  const isUploaderTile = label.toLowerCase() === 'uploaded by'

  return (
    <article className="flex h-[108px] flex-col items-center justify-center rounded-md border border-white/10 bg-[#131010] px-3 text-center">
      <span className="flex h-6 items-center justify-center text-[14px] leading-none text-amber-300/95">{icon}</span>
      <p
        className={`mt-2 w-full truncate px-1 font-[family-name:var(--font-heading)] font-semibold leading-none text-white ${
          isUploaderTile ? 'text-[25px]' : 'text-[28px]'
        }`}
        title={value}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/45">{label}</p>
    </article>
  )
}

export default CharacterStatTile
