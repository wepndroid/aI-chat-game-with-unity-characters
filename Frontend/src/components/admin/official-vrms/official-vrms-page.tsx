'use client'

import AdminPageShell from '@/components/shared/admin-page-shell'
import AdminOfficialVrmRow, { type AdminOfficialVrmRecord } from '@/components/ui-elements/admin-official-vrm-row'
import { type AdminOfficialVrmStatus } from '@/components/ui-elements/admin-official-vrm-status-pill'
import { listCharacters, updateCharacterStatus, type CharacterListRecord } from '@/lib/character-api'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

const formatCompactMetric = (value: number) => {
  if (value >= 1_000_000) {
    const formatted = (value / 1_000_000).toFixed(1)
    return formatted.endsWith('.0') ? `${Math.round(value / 1_000_000)}M` : `${formatted}M`
  }

  if (value >= 1_000) {
    const formatted = (value / 1_000).toFixed(1)
    return formatted.endsWith('.0') ? `${Math.round(value / 1_000)}K` : `${formatted}K`
  }

  return String(value)
}

const formatReleaseDateLabel = (isoValue: string) => {
  const parsedMs = Date.parse(isoValue)

  if (Number.isNaN(parsedMs)) {
    return '—'
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(new Date(parsedMs))
}

const mapCharacterStatusToPillStatus = (characterRecord: CharacterListRecord): AdminOfficialVrmStatus => {
  switch (characterRecord.status) {
    case 'APPROVED':
      return 'published'
    case 'PENDING':
      return 'pending'
    case 'REJECTED':
      return 'rejected'
    case 'ARCHIVED':
      return 'archived'
    case 'DRAFT':
      return 'draft'
    default:
      return 'draft'
  }
}

const toOfficialVrmRecord = (characterRecord: CharacterListRecord): AdminOfficialVrmRecord => {
  const taglineText = characterRecord.tagline?.trim() ?? ''

  return {
    id: characterRecord.id,
    slug: characterRecord.slug,
    code: characterRecord.slug.toUpperCase(),
    name: characterRecord.name,
    tagline: taglineText.length > 0 ? taglineText : '—',
    hearts: formatCompactMetric(characterRecord.heartsCount),
    views: formatCompactMetric(characterRecord.viewsCount),
    status: mapCharacterStatusToPillStatus(characterRecord),
    releaseDate: formatReleaseDateLabel(characterRecord.createdAt),
    previewImageUrl: characterRecord.previewImageUrl
  }
}

const PlusIcon = () => {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M12 5.2v13.6M5.2 12h13.6" strokeLinecap="round" />
    </svg>
  )
}

const OfficialVrmsPage = () => {
  const [characterList, setCharacterList] = useState<CharacterListRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [busyCharacterId, setBusyCharacterId] = useState<string | null>(null)

  const loadOfficialCharacters = useCallback(async (withSpinner = true) => {
    if (withSpinner) {
      setIsLoading(true)
    }

    setErrorMessage(null)

    try {
      const payload = await listCharacters({ galleryScope: 'curated', limit: 200 })
      setCharacterList(payload.data)
    } catch (error) {
      setCharacterList([])
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load official characters.')
    } finally {
      if (withSpinner) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadOfficialCharacters(true)
  }, [loadOfficialCharacters])

  const handleArchive = (characterId: string) => {
    Promise.resolve().then(async () => {
      setBusyCharacterId(characterId)
      setErrorMessage(null)

      try {
        await updateCharacterStatus(characterId, 'ARCHIVED')
        await loadOfficialCharacters(false)
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to archive character.')
      } finally {
        setBusyCharacterId(null)
      }
    })
  }

  return (
    <AdminPageShell activeKey="official-vrms">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-[29px] font-normal leading-none text-white">Official Characters</h1>
          <p className="mt-1 text-[15px] font-[family-name:var(--font-heading)] font-normal text-[#9ab0cd]">
            Manage and publish official, curated VRMs produced by the platform.
          </p>
        </div>

        <Link
          href="/upload-vrm"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-gradient-to-r from-ember-300 to-ember-400 px-6 text-[12px] font-normal uppercase tracking-[0.05em] text-[#1b130f] transition hover:brightness-105"
          aria-label="Add official VRM"
        >
          <PlusIcon />
          Add Official VRM
        </Link>
      </div>

      {errorMessage ? (
        <section className="mt-5 rounded-lg border border-rose-300/30 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">{errorMessage}</section>
      ) : null}

      <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f14]/95">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-white/10 bg-[#181b21]/85">
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Character</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Tagline / Title</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Metrics</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Status</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Created</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Actions</th>
              </tr>
            </thead>

            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-[#7c8aa3]">
                    Loading official characters...
                  </td>
                </tr>
              ) : null}

              {!isLoading && characterList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-[#7c8aa3]">
                    No official curated characters yet. Add one from Upload VRM (admins can mark &quot;Official / curated&quot;).
                  </td>
                </tr>
              ) : null}

              {!isLoading
                ? characterList.map((characterRecord) => (
                    <AdminOfficialVrmRow
                      key={characterRecord.id}
                      vrmRecord={toOfficialVrmRecord(characterRecord)}
                      isBusy={busyCharacterId === characterRecord.id}
                      onArchive={characterRecord.status === 'ARCHIVED' ? undefined : handleArchive}
                    />
                  ))
                : null}
            </tbody>
          </table>
        </div>
      </section>
    </AdminPageShell>
  )
}

export default OfficialVrmsPage
