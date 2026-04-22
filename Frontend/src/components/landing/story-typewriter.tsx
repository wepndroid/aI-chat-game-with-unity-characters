'use client'

import { useEffect, useState, useRef } from 'react'

const stories = [
  "You work a dead end job that pays decently well. The only thing you look forward to in your day is your safe haven: The recently renovated and purchased apartment that you got recently.",
  "Your foster mom received beautiful new breasts as a gift from her husband. Now you're all on summer vacation together."
]

type Phase = 'typing' | 'pausing' | 'deleting'

const TYPING_SPEED = 35
const DELETING_SPEED = 15
const PAUSE_DURATION = 3000

const StoryTypewriter = () => {
  const [displayText, setDisplayText] = useState('')
  const [storyIndex, setStoryIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('typing')
  const charIndex = useRef(0)

  useEffect(() => {
    const currentStory = stories[storyIndex]

    if (phase === 'typing') {
      if (charIndex.current < currentStory.length) {
        const timeout = setTimeout(() => {
          charIndex.current += 1
          setDisplayText(currentStory.slice(0, charIndex.current))
        }, TYPING_SPEED)
        return () => clearTimeout(timeout)
      } else {
        setPhase('pausing')
      }
    }

    if (phase === 'pausing') {
      const timeout = setTimeout(() => {
        setPhase('deleting')
      }, PAUSE_DURATION)
      return () => clearTimeout(timeout)
    }

    if (phase === 'deleting') {
      if (charIndex.current > 0) {
        const timeout = setTimeout(() => {
          charIndex.current -= 1
          setDisplayText(currentStory.slice(0, charIndex.current))
        }, DELETING_SPEED)
        return () => clearTimeout(timeout)
      } else {
        const nextIndex = (storyIndex + 1) % stories.length
        setStoryIndex(nextIndex)
        setPhase('typing')
      }
    }
  }, [displayText, phase, storyIndex])

  return (
    <div className="border border-orange-900/30 rounded-xl flex-1 min-h-[80px] bg-black/40 relative z-10 overflow-hidden">
      {/* Fake editor header */}
      <div className="flex items-center px-5 py-3 border-b border-gray-800/60 bg-black/30">
        <span className="text-[10px] text-gray-500 uppercase tracking-widest font-medium">Custom Character Scenario</span>
      </div>

      {/* Animated text area */}
      <div className="p-5">
        <p className="text-sm text-gray-300 leading-relaxed font-mono min-h-[60px]">
          {displayText}
          <span className="inline-block w-[2px] h-[1em] bg-orange-400 ml-[1px] align-middle animate-pulse"></span>
        </p>
      </div>
    </div>
  )
}

export default StoryTypewriter
