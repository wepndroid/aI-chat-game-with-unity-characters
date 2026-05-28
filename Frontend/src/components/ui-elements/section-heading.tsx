type SectionHeadingProps = {
  text: string
  className?: string
}

const SectionHeading = ({ text, className = '' }: SectionHeadingProps) => {
  return (
    <h2 className={`text-center font-[family-name:var(--font-heading)] text-[26px] font-bold leading-[1.04] tracking-[-0.03em] text-white/90 sm:text-4xl ${className}`}>
      {text}
    </h2>
  )
}

export default SectionHeading
