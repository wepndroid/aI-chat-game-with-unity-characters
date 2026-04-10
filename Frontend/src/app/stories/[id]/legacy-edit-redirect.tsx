'use client'

import { SCENARIO_EDIT_RETURN_TO_YOUR_SCENARIOS } from '@/components/your-characters/your-scenarios-helpers'
import { getStory } from '@/lib/story-api'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

/** Old `/stories/[id]/edit` → `/characters/.../edit-scenario/...`. */
const LegacyEditRedirect = () => {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const [label, setLabel] = useState('Redirecting…')

  useEffect(() => {
    const raw = params.id
    const storyId = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : ''

    if (!storyId) {
      router.replace('/characters')
      return
    }

    const returnTo = searchParams.get('returnTo')
    const returnToQuery =
      returnTo === SCENARIO_EDIT_RETURN_TO_YOUR_SCENARIOS
        ? `?returnTo=${encodeURIComponent(SCENARIO_EDIT_RETURN_TO_YOUR_SCENARIOS)}`
        : ''

    let isCancelled = false

    getStory(storyId)
      .then((payload) => {
        if (isCancelled) {
          return
        }

        const ch = payload.data.character
        const key = ch?.slug ?? ch?.id ?? payload.data.characterId

        if (key) {
          router.replace(
            `/characters/${encodeURIComponent(key)}/edit-scenario/${encodeURIComponent(storyId)}${returnToQuery}`
          )
        } else {
          setLabel('This scenario has no character link.')
          router.replace('/characters')
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setLabel('Could not open editor.')
          router.replace('/characters')
        }
      })

    return () => {
      isCancelled = true
    }
  }, [params.id, router, searchParams])

  return (
    <main className="relative min-h-[calc(100vh-140px)] bg-[#030303] text-white">
      <div className="mx-auto max-w-6xl px-5 pt-24 text-center text-sm text-white/70">{label}</div>
    </main>
  )
}

export default LegacyEditRedirect
