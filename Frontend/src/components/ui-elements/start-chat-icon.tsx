/** Same artwork as the icon beside the character page “Start Chat” control. */
const StartChatIcon = ({ className = 'size-8' }: { className?: string }) => {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 2.75c-4.97 0-9 3.32-9 7.43 0 2.61 1.65 4.9 4.14 6.22-.09 1.11-.4 2.26-1.12 3.03a.6.6 0 0 0 .58 1.01c1.92-.35 3.49-1.2 4.45-1.86.31.03.62.05.95.05 4.97 0 9-3.32 9-7.43S16.97 2.75 12 2.75Z"
        fill="currentColor"
      />
      <circle cx="8.5" cy="10.3" r="1.05" fill="#f48f49" />
      <circle cx="12" cy="10.3" r="1.05" fill="#f48f49" />
      <circle cx="15.5" cy="10.3" r="1.05" fill="#f48f49" />
    </svg>
  )
}

export default StartChatIcon
