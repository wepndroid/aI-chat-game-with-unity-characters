import Link from 'next/link'
import { buildAiGirlfriendRouteHref } from '@/lib/ai-girlfriend-route'

type CharacterCardProps = {
  id: string
  name: string
  likes: string
  gradientClassName: string
  score?: string
  summary?: string
  actionLabel?: string
  actionHref?: string
  cardHeightClassName?: string
  actionFullWidth?: boolean
}

const CharacterCard = ({
  id,
  name,
  likes,
  gradientClassName,
  score,
  summary,
  actionLabel = 'View Profile',
  actionHref,
  cardHeightClassName = 'h-64',
  actionFullWidth = false
}: CharacterCardProps) => {
  const finalActionHref = actionHref ?? buildAiGirlfriendRouteHref(name, id)
  const actionButtonClassName = actionFullWidth
    ? 'mt-3 inline-flex min-h-[42px] w-full justify-center rounded-xl border border-ember-200/30 bg-black/35 px-3 py-2 text-[13px] font-semibold uppercase tracking-[0.11em] text-white transition hover:border-ember-300/70 hover:text-ember-200 sm:mt-2 sm:min-h-0 sm:rounded-md sm:py-1 sm:text-[11px]'
    : 'mt-3 inline-flex min-h-[42px] rounded-xl border border-ember-200/30 bg-black/35 px-3 py-2 text-[13px] font-semibold uppercase tracking-[0.11em] text-white transition hover:border-ember-300/70 hover:text-ember-200 sm:mt-2 sm:min-h-0 sm:rounded-md sm:py-1 sm:text-[11px]'

  return (
    <article className="mx-auto w-3/4 overflow-hidden rounded-2xl border border-ember-400/20 bg-[#0b0b0b] shadow-[0_20px_45px_rgba(0,0,0,0.45)]">
      <div className={`relative ${cardHeightClassName} bg-gradient-to-b ${gradientClassName}`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.2),transparent_42%)]" />
        <div className="absolute right-3 top-3 flex items-center gap-1">
          {score ? (
            <span className="rounded-full bg-black/45 px-2.5 py-1 text-[12px] font-bold text-amber-200 sm:px-2 sm:text-[10px]">
              * {score}
            </span>
          ) : null}
          <span className="rounded-full bg-black/40 px-2.5 py-1 text-[12px] font-bold text-ember-100 sm:px-2 sm:text-[10px]">{likes}</span>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-3">
          {summary ? <p className="mb-2 text-[14px] leading-5 text-white/78 sm:mb-1 sm:text-[10px] sm:leading-4">{summary}</p> : null}
          <p className="font-[family-name:var(--font-heading)] text-[20px] font-normal italic text-white/95 sm:text-base">{name}</p>
          <Link
            href={finalActionHref}
            className={actionButtonClassName}
            aria-label={`${actionLabel} for ${name}`}
          >
            {actionLabel}
          </Link>
        </div>
      </div>
    </article>
  )
}

export default CharacterCard
