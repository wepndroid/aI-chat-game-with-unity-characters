import Link from 'next/link'

type CharacterGalleryCardProps = {
  id: string
  name: string
  likes: string
  chats: string
  gradientClassName: string
  description?: string
}

const CharacterGalleryCard = ({ id, name, likes, chats, gradientClassName, description }: CharacterGalleryCardProps) => {
  return (
    <article className="overflow-hidden rounded-xl border border-white/15 bg-[#111111]">
      <div className={`relative h-[272px] bg-gradient-to-b ${gradientClassName}`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_8%,rgba(255,255,255,0.32),transparent_50%)]" />

        <div className="absolute right-2 top-2 flex items-center gap-1">
          <span className="inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-[10px] font-bold text-amber-200">
            <span className="text-[9px] leading-none">x</span>
            {likes}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-[10px] font-bold text-white/85">
            <span className="text-[9px] leading-none">o</span>
            {chats}
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#fb8f47]/90 via-[#fb8f47]/58 to-transparent p-3">
          <p className="text-center font-[family-name:var(--font-heading)] text-[35px] font-semibold italic leading-none text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]">
            {name}
          </p>
          {description ? <p className="mt-1.5 text-center text-[10px] leading-[1.35] text-white/85">{description}</p> : null}
          <div className="mt-2 flex justify-center">
            <Link
              href={`/characters/${id}`}
              className="inline-flex h-6 min-w-[96px] items-center justify-center rounded border border-black/30 bg-[#121212] px-4 text-[9px] font-bold uppercase tracking-[0.08em] text-white transition hover:border-ember-300 hover:text-ember-200"
              aria-label={`Open ${name} profile`}
            >
              Chat Now
            </Link>
          </div>
        </div>
      </div>
    </article>
  )
}

export default CharacterGalleryCard
