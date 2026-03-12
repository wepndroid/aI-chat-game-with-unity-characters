import Link from 'next/link'

type CharacterCardProps = {
  id: string
  name: string
  likes: string
  gradientClassName: string
}

const CharacterCard = ({ id, name, likes, gradientClassName }: CharacterCardProps) => {
  return (
    <article className="overflow-hidden rounded-2xl border border-ember-400/20 bg-[#0b0b0b] shadow-[0_20px_45px_rgba(0,0,0,0.45)]">
      <div className={`relative h-64 bg-gradient-to-b ${gradientClassName}`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.2),transparent_42%)]" />
        <div className="absolute right-3 top-3 rounded-full bg-black/40 px-2 py-1 text-[11px] font-bold text-ember-100">{likes}</div>
        <div className="absolute inset-x-0 bottom-0 p-3">
          <p className="font-[family-name:var(--font-heading)] text-2xl font-semibold italic text-white/95">{name}</p>
          <Link
            href={`/characters/${id}`}
            className="mt-2 inline-flex rounded-md border border-ember-200/30 bg-black/35 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.11em] text-white transition hover:border-ember-300/70 hover:text-ember-200"
            aria-label={`Open ${name} profile`}
          >
            View Profile
          </Link>
        </div>
      </div>
    </article>
  )
}

export default CharacterCard
