type FaqItemProps = {
  question: string
  answer: string
}

const FaqItem = ({ question, answer }: FaqItemProps) => {
  return (
    <details className="group rounded-xl border border-ember-300/25 bg-[#0f0d0b]/90 px-5 py-4 open:border-ember-300/60">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-ember-200/95">
        <span>{question}</span>
        <span className="text-lg leading-none text-ember-300 group-open:hidden">+</span>
        <span className="hidden text-lg leading-none text-ember-300 group-open:inline">-</span>
      </summary>
      <p className="pt-4 text-sm leading-relaxed text-white/75">{answer}</p>
    </details>
  )
}

export default FaqItem
