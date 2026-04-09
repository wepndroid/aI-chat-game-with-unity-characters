'use client'

import { getStory } from '@/lib/story-api'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

type StoryToCharacterRedirectProps = {
  storyId: string
}

/** Scenarios are listed on the character page only — no standalone story URL. */
const StoryToCharacterRedirect = ({ storyId }: StoryToCharacterRedirectProps) => {
  const router = useRouter()
  const [message, setMessage] = useState('Opening character…')

  useEffect(() => {
    let isCancelled = false

    getStory(storyId)
      .then((payload) => {
        if (isCancelled) {
          return
        }

        const ch = payload.data.character
        const key = ch?.slug ?? ch?.id ?? payload.data.characterId

        if (key) {
          router.replace(`/characters/${encodeURIComponent(key)}`)
        } else {
          setMessage('This scenario is not linked to a character.')
          router.replace('/characters')
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setMessage('Could not open character.')
          router.replace('/characters')
        }
      })

    return () => {
      isCancelled = true
    }
  }, [router, storyId])

  return (
    <main className="relative min-h-[calc(100vh-140px)] bg-[#030303] text-white">
      <div className="mx-auto max-w-6xl px-5 pt-24 text-center text-sm text-white/70">{message}</div>
    </main>
  )
}

export default StoryToCharacterRedirect
