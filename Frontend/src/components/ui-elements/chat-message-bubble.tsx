type ChatMessageBubbleProps = {
  message: string
  align?: 'left' | 'right'
}

const ChatMessageBubble = ({ message, align = 'left' }: ChatMessageBubbleProps) => {
  const alignmentClassName = align === 'right' ? 'ml-10 bg-[#121010]/95' : 'mr-10 bg-[#181311]/95'

  return (
    <p className={`rounded-md border border-white/10 px-3 py-2 text-[11px] leading-[1.45] text-white/75 ${alignmentClassName}`}>
      {message}
    </p>
  )
}

export default ChatMessageBubble
