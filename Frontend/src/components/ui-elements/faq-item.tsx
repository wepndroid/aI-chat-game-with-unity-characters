type FaqItemProps = {
  question: string
  answer: string
}

const FaqItem = ({ question, answer }: FaqItemProps) => {
  return (
    <details className="group rounded-2xl border border-ember-300/25 bg-[#0f0d0b]/90 px-5 py-4 shadow-[0_0_0_rgba(0,0,0,0)] transition-[border-color,background-color,box-shadow] duration-300 ease-out open:border-ember-300/60 open:bg-[#14110e] open:shadow-[0_10px_26px_rgba(0,0,0,0.28)] sm:rounded-xl">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[16px] font-semibold leading-6 text-ember-200/95 sm:text-sm sm:leading-normal">
        <span>{question}</span>
        <span className="text-lg leading-none text-ember-300 transition-transform duration-300 ease-out group-open:rotate-45">+</span>
      </summary>
      <div className="grid grid-rows-[0fr] opacity-0 transition-[grid-template-rows,opacity] duration-300 ease-out group-open:grid-rows-[1fr] group-open:opacity-100">
        <p className="overflow-hidden pt-4 text-[15px] leading-6 text-white/78 sm:text-sm sm:leading-relaxed">{answer}</p>
      </div>
    </details>
  )
}

export default FaqItem
