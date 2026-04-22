import type { ReactNode } from 'react'

type CharacterStatTileProps = {
  icon: ReactNode
  value: string
  label: string
}

const CharacterStatTile = ({ icon, value, label }: CharacterStatTileProps) => {
  const isUploaderTile = label.toLowerCase() === 'uploaded by'

  return (
    <article className="flex h-[92px] flex-col items-center justify-center rounded-[20px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.015))] px-3 text-center shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
      <span className="flex h-5 items-center justify-center text-[12px] leading-none text-white/58">{icon}</span>
      <p
        className={`mt-1.5 w-full truncate px-1 font-[family-name:var(--font-heading)] font-semibold leading-none text-white/72 ${
          isUploaderTile ? 'text-[18px]' : 'text-[19px]'
        }`}
        title={value}
      >
        {value}
      </p>
      <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/20">{label}</p>
    </article>
  )
}

export default CharacterStatTile
