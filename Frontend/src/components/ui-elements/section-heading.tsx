type SectionHeadingProps = {
  text: string
  className?: string
}

const SectionHeading = ({ text, className = '' }: SectionHeadingProps) => {
  return (
    <h2 className={`text-center font-[family-name:var(--font-heading)] text-4xl font-bold italic text-white/90 ${className}`}>
      {text}
    </h2>
  )
}

export default SectionHeading
