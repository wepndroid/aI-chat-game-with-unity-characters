type PlatformIconType = 'browser' | 'windows' | 'pcvr' | 'meta-quest'

type PlatformItemProps = {
  label: string
  iconType: PlatformIconType
}

type PlatformIconProps = {
  iconType: PlatformIconType
}

const PlatformIcon = ({ iconType }: PlatformIconProps) => {
  if (iconType === 'browser') {
    return (
      <svg viewBox="0 0 24 24" className="h-7 w-7 text-white/85" aria-hidden="true">
        <circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 12L18.7 8.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M12 12L7.5 19.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  if (iconType === 'windows') {
    return (
      <svg viewBox="0 0 24 24" className="h-7 w-7 text-white/90" aria-hidden="true">
        <rect x="3.4" y="3.4" width="17.2" height="17.2" rx="2.5" fill="#d88b6a" opacity="0.75" />
        <rect x="6.3" y="6.4" width="4.8" height="4.3" fill="currentColor" />
        <rect x="12.8" y="6.4" width="4.8" height="4.3" fill="currentColor" />
        <rect x="6.3" y="12.2" width="4.8" height="4.3" fill="currentColor" />
        <rect x="12.8" y="12.2" width="4.8" height="4.3" fill="currentColor" />
      </svg>
    )
  }

  if (iconType === 'pcvr') {
    return (
      <svg viewBox="0 0 24 24" className="h-7 w-7 text-white/88" aria-hidden="true">
        <rect x="3.7" y="8.6" width="16.6" height="7.1" rx="3.1" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M7.5 8.6L8.9 6.9H15.1L16.5 8.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="9.3" cy="12.15" r="1.05" fill="currentColor" />
        <circle cx="14.7" cy="12.15" r="1.05" fill="currentColor" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 text-white/85" aria-hidden="true">
      <path
        d="M5.2 13.2C5.2 10.9 6.8 9.2 8.8 9.2C10.4 9.2 11.6 10.2 12 11.7C12.4 10.2 13.6 9.2 15.2 9.2C17.2 9.2 18.8 10.9 18.8 13.2C18.8 15.4 17.2 17.1 15.2 17.1C13.6 17.1 12.4 16.1 12 14.7C11.6 16.1 10.4 17.1 8.8 17.1C6.8 17.1 5.2 15.4 5.2 13.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const PlatformItem = ({ label, iconType }: PlatformItemProps) => {
  return (
    <div className="flex flex-col items-center">
      <div className="relative flex h-[50px] w-[56px] items-center justify-center overflow-hidden rounded-[13px] border-[2px] border-white/80 bg-black/12">
        <div className="absolute inset-0 bg-white/40" aria-hidden="true" />
        <div className="relative z-10">
          <PlatformIcon iconType={iconType} />
        </div>
      </div>
      <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.07em] text-white/95">{label}</p>
    </div>
  )
}

export default PlatformItem
export type { PlatformIconType }
