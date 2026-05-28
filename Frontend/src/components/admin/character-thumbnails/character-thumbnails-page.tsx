'use client'

import AdminPageShell from '@/components/shared/admin-page-shell'
import {
  getCharacterDetail,
  generateBulkCharacterThumbnails,
  generateCharacterThumbnails,
  listAdminThumbnailCandidates,
  type AdminThumbnailCandidateRecord,
  type CharacterDetailRecord
} from '@/lib/character-api'
import { useEffect, useMemo, useState } from 'react'

type ThumbnailTargetKey = 'desktop' | 'mobile'

type TargetFormState = {
  enabled: boolean
  width: string
  height: string
  fit: 'cover' | 'contain'
}

const sectionClassName = 'rounded-2xl border border-white/10 bg-[#0c0f14]/95 p-4 sm:p-5'
const labelClassName = 'text-xs font-semibold uppercase tracking-[0.08em] text-white/60'
const inputClassName =
  'mt-1 w-full rounded-md border border-white/15 bg-[#0f1116]/95 px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-ember-300 focus:ring-2 focus:ring-ember-400/25'
const tileStatusClassName = 'absolute right-1.5 top-1.5 inline-flex size-5 items-center justify-center rounded-full border text-[10px] shadow-[0_4px_12px_rgba(0,0,0,0.35)]'

const defaultTargetState: Record<ThumbnailTargetKey, TargetFormState> = {
  desktop: {
    enabled: true,
    width: '360',
    height: '620',
    fit: 'cover'
  },
  mobile: {
    enabled: true,
    width: '360',
    height: '620',
    fit: 'cover'
  }
}

const parseDimension = (value: string) => {
  const parsed = Number.parseInt(value.trim(), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

const CharacterThumbnailsPage = () => {
  const [searchValue, setSearchValue] = useState('')
  const [characterList, setCharacterList] = useState<AdminThumbnailCandidateRecord[]>([])
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null)
  const [selectedCharacterDetails, setSelectedCharacterDetails] = useState<CharacterDetailRecord | null>(null)
  const [targetState, setTargetState] = useState(defaultTargetState)
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isBulkGenerating, setIsBulkGenerating] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    let isCancelled = false
    const timeoutId = window.setTimeout(() => {
      Promise.resolve().then(async () => {
        if (isCancelled) {
          return
        }

        setIsLoading(true)
        setErrorMessage(null)

        try {
          const payload = await listAdminThumbnailCandidates({
            search: searchValue,
            limit: 500
          })

          if (isCancelled) {
            return
          }

          setCharacterList(payload.data)
          setSelectedCharacterId((previous) => {
            if (previous && payload.data.some((item) => item.id === previous)) {
              return previous
            }

            return payload.data[0]?.id ?? null
          })
        } catch (error) {
          if (!isCancelled) {
            setCharacterList([])
            setErrorMessage(error instanceof Error ? error.message : 'Failed to load characters.')
          }
        } finally {
          if (!isCancelled) {
            setIsLoading(false)
          }
        }
      })
    }, 220)

    return () => {
      isCancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [searchValue])

  const selectedCharacter = useMemo(
    () => characterList.find((item) => item.id === selectedCharacterId) ?? null,
    [characterList, selectedCharacterId]
  )

  useEffect(() => {
    let isCancelled = false

    if (!selectedCharacterId) {
      setSelectedCharacterDetails(null)
      return undefined
    }

    setSelectedCharacterDetails(null)

    Promise.resolve().then(async () => {
      try {
        const payload = await getCharacterDetail(selectedCharacterId)
        if (!isCancelled) {
          setSelectedCharacterDetails(payload.data)
        }
      } catch {
        if (!isCancelled) {
          setSelectedCharacterDetails(null)
        }
      }
    })

    return () => {
      isCancelled = true
    }
  }, [selectedCharacterId])

  const selectedTargets = useMemo(() => {
    const result: Array<{
      key: ThumbnailTargetKey
      width: number
      height: number
      fit: 'cover' | 'contain'
    }> = []

    for (const key of ['desktop', 'mobile'] as const) {
      const target = targetState[key]
      if (!target.enabled) {
        continue
      }

      const width = parseDimension(target.width)
      const height = parseDimension(target.height)

      if (!width || !height) {
        return null
      }

      result.push({
        key,
        width,
        height,
        fit: target.fit
      })
    }

    return result
  }, [targetState])

  const handleGenerate = async () => {
    if (!selectedCharacter || !selectedTargets || selectedTargets.length === 0 || isGenerating) {
      return
    }

    setIsGenerating(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const payload = await generateCharacterThumbnails(selectedCharacter.id, {
        targets: selectedTargets
      })

      setSelectedCharacterDetails((previous) =>
        previous && previous.id === selectedCharacter.id
          ? {
            ...previous,
            previewImageUrl: payload.data.previewImageUrl,
            cardThumbnailDesktopUrl: payload.data.cardThumbnailDesktopUrl,
            cardThumbnailMobileUrl: payload.data.cardThumbnailMobileUrl,
            updatedAt: new Date().toISOString()
          }
          : previous
      )

      setSuccessMessage(
        `Saved ${selectedTargets.map((item) => item.key).join(' + ')} thumbnail${selectedTargets.length === 1 ? '' : 's'} for ${selectedCharacter.name}.`
      )
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Thumbnail generation failed.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleBulkGenerate = async () => {
    if (!selectedTargets || selectedTargets.length === 0 || isBulkGenerating) {
      return
    }

    setIsBulkGenerating(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const payload = await generateBulkCharacterThumbnails({
        search: searchValue.trim() || undefined,
        targets: selectedTargets
      })

      const resultMap = new Map(payload.data.results.map((item) => [item.id, item]))

      const selectedCharacterId = selectedCharacter?.id ?? null
      const selectedResult = selectedCharacterId ? resultMap.get(selectedCharacterId) : null
      if (selectedResult?.status === 'generated') {
        setSelectedCharacterDetails((previous) =>
          previous && previous.id === selectedCharacterId
            ? {
              ...previous,
              cardThumbnailDesktopUrl: selectedResult.cardThumbnailDesktopUrl ?? previous.cardThumbnailDesktopUrl,
              cardThumbnailMobileUrl: selectedResult.cardThumbnailMobileUrl ?? previous.cardThumbnailMobileUrl,
              updatedAt: new Date().toISOString()
            }
            : previous
        )
      }

      setSuccessMessage(
        `Bulk regenerate finished. Generated ${payload.data.generatedCount}, skipped ${payload.data.skippedCount}, failed ${payload.data.failureCount}.`
      )
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Bulk thumbnail generation failed.')
    } finally {
      setIsBulkGenerating(false)
    }
  }

  const eligibleCharacterCount = useMemo(
    () => characterList.filter((item) => Boolean(item.previewImageUrl)).length,
    [characterList]
  )

  const getStatusIcon = (character: AdminThumbnailCandidateRecord) => {
    if (character.previewImageUrl) {
      return {
        className: `${tileStatusClassName} border-sky-300/35 bg-sky-300/15 text-sky-100`,
        label: 'Preview available',
        glyph: 'O'
      }
    }

    return {
      className: `${tileStatusClassName} border-white/15 bg-black/55 text-white/45`,
      label: 'No preview image',
      glyph: 'X'
    }
  }

  const renderPreviewPanel = (title: string, imageUrl: string | null, helper: string) => (
    <article className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={labelClassName}>{title}</p>
          <p className="mt-1 text-xs text-white/45">{helper}</p>
        </div>
      </div>
      <div className="mt-3 overflow-hidden rounded-lg border border-white/10 bg-[#090b10]">
        {imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={title} className="aspect-[5/8] w-full object-cover object-center" />
          </>
        ) : (
          <div className="flex aspect-[5/8] items-center justify-center px-4 text-center text-sm text-white/35">
            No image saved yet.
          </div>
        )}
      </div>
    </article>
  )

  return (
    <AdminPageShell activeKey="character-thumbnails" contentClassName="min-w-0 p-4 pb-8 sm:p-6 xl:p-8 2xl:p-10">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <h1 className="font-[family-name:var(--font-heading)] text-[24px] font-normal leading-tight text-white sm:text-[29px] sm:leading-none">
            Character Thumbnails
          </h1>
          <p className="mt-2 max-w-4xl text-sm leading-relaxed text-[#95a6c1]">
            Keep the original preview untouched, then generate 360 x 620 card thumbnails for each character.
          </p>
        </div>
        <button
          type="button"
          onClick={handleBulkGenerate}
          disabled={!selectedTargets || selectedTargets.length === 0 || isBulkGenerating || eligibleCharacterCount === 0}
          className="inline-flex h-11 items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 text-[12px] font-bold uppercase tracking-[0.08em] text-white/90 transition hover:border-white/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.04] disabled:text-white/40"
        >
          {isBulkGenerating ? 'Bulk regenerating...' : `Regenerate all (${eligibleCharacterCount})`}
        </button>
      </div>

      {errorMessage ? (
        <p className="mt-5 rounded-md border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">{errorMessage}</p>
      ) : null}
      {successMessage ? (
        <p className="mt-5 rounded-md border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100">{successMessage}</p>
      ) : null}

      <div className="mt-6 grid gap-6 2xl:grid-cols-[380px_minmax(0,1fr)]">
        <section className={`${sectionClassName} min-w-0`}>
          <label className="block">
            <span className={labelClassName}>Find character</span>
            <input
              className={inputClassName}
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search by name or slug"
            />
          </label>
          <div className="mt-3 flex items-center justify-between gap-3 text-xs leading-relaxed text-white/45">
            <p>
            Bulk regenerate applies the current size settings to every character in this search result that already has an original preview image.
            </p>
            <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.08em] text-white/65">
              {characterList.length} loaded
            </span>
          </div>

          <div className="mt-4">
            {isLoading ? <p className="text-sm text-white/65">Loading characters...</p> : null}
            {!isLoading && characterList.length === 0 ? (
              <p className="rounded-lg border border-dashed border-white/10 bg-black/20 px-4 py-5 text-sm text-white/55">
                No characters matched this search.
              </p>
            ) : null}
            {!isLoading
              ? <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-6 2xl:grid-cols-5">
                {characterList.map((character) => {
                  const isSelected = character.id === selectedCharacterId
                  const tileImageUrl = character.previewImageUrl ?? null
                  const statusIcon = getStatusIcon(character)

                  return (
                    <button
                      key={character.id}
                      type="button"
                      onClick={() => setSelectedCharacterId(character.id)}
                      className={`group relative overflow-hidden rounded-xl border transition ${
                        isSelected
                          ? 'border-ember-300/80 bg-ember-300/10 shadow-[0_0_0_1px_rgba(244,99,19,0.28)]'
                          : 'border-white/10 bg-black/20 hover:border-white/25 hover:bg-white/5'
                      }`}
                      aria-label={`Select ${character.name}`}
                      title={character.name}
                    >
                      <span className={statusIcon.className} aria-hidden="true">
                        {statusIcon.glyph}
                      </span>
                      <span className="sr-only">{statusIcon.label}</span>
                      <div className="relative aspect-[5/7] w-full overflow-hidden bg-[#090b10]">
                        {tileImageUrl ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={tileImageUrl}
                              alt={character.name}
                              className="h-full w-full object-cover object-center transition duration-200 group-hover:scale-[1.03]"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
                          </>
                        ) : (
                          <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_50%_20%,rgba(244,99,19,0.18),transparent_40%),linear-gradient(180deg,#191c24_0%,#090b10_100%)] px-2 text-center text-[11px] uppercase tracking-[0.08em] text-white/35">
                            No image
                          </div>
                        )}
                        {isSelected ? (
                          <span className="absolute left-1.5 top-1.5 inline-flex size-5 items-center justify-center rounded-full border border-ember-200/40 bg-ember-400 text-[11px] font-bold text-white">
                            ✓
                          </span>
                        ) : null}
                        <div className="absolute inset-x-0 bottom-0 px-2 pb-2 pt-6 text-left">
                          <p className="truncate text-[11px] font-semibold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.65)]">
                            {character.name}
                          </p>
                          <p className="truncate text-[9px] uppercase tracking-[0.08em] text-white/55">
                            {character.slug}
                          </p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
              : null}
            {!isLoading && characterList.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.08em] text-white/55">
                <span className="rounded-full border border-sky-300/20 bg-sky-300/10 px-2 py-1 text-sky-100">O = original only</span>
                <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-amber-100">1 = one resized variant</span>
                <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-1 text-emerald-100">2 = desktop + mobile saved</span>
              </div>
            ) : null}
          </div>
        </section>

        <div className="space-y-6 min-w-0">
          <section className={sectionClassName}>
            {selectedCharacter ? (
              <>
                <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className={labelClassName}>Selected character</p>
                    <h2 className="mt-2 font-[family-name:var(--font-heading)] text-[28px] font-normal leading-none text-white">
                      {selectedCharacter.name}
                    </h2>
                    <p className="mt-2 text-sm text-white/55">{selectedCharacter.slug}</p>
                  </div>

                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={!selectedTargets || selectedTargets.length === 0 || isGenerating || !selectedCharacter.previewImageUrl}
                    className="inline-flex h-11 items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-5 text-[12px] font-bold uppercase tracking-[0.08em] text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:from-neutral-600 disabled:to-neutral-700 disabled:text-white/55"
                  >
                    {isGenerating ? 'Generating...' : 'Generate selected thumbnails'}
                  </button>
                </div>

                {!selectedCharacter.previewImageUrl ? (
                  <p className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-sm text-amber-50">
                    This character does not have an original preview image yet, so there is nothing to resize.
                  </p>
                ) : null}

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  {(['desktop', 'mobile'] as const).map((key) => (
                    <article key={key} className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className={labelClassName}>{key === 'desktop' ? 'Desktop card' : 'Mobile card'}</p>
                          <p className="mt-1 text-xs text-white/45">Use 360 x 620 for the public character cards.</p>
                        </div>
                        <label className="inline-flex items-center gap-2 text-sm text-white/75">
                          <input
                            type="checkbox"
                            checked={targetState[key].enabled}
                            onChange={(event) =>
                              setTargetState((previous) => ({
                                ...previous,
                                [key]: {
                                  ...previous[key],
                                  enabled: event.target.checked
                                }
                              }))
                            }
                          />
                          Include
                        </label>
                      </div>

                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <label>
                          <span className={labelClassName}>Width</span>
                          <input
                            className={inputClassName}
                            value={targetState[key].width}
                            onChange={(event) =>
                              setTargetState((previous) => ({
                                ...previous,
                                [key]: {
                                  ...previous[key],
                                  width: event.target.value
                                }
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span className={labelClassName}>Height</span>
                          <input
                            className={inputClassName}
                            value={targetState[key].height}
                            onChange={(event) =>
                              setTargetState((previous) => ({
                                ...previous,
                                [key]: {
                                  ...previous[key],
                                  height: event.target.value
                                }
                              }))
                            }
                          />
                        </label>
                      </div>

                      <label className="mt-4 block">
                        <span className={labelClassName}>Fit</span>
                        <select
                          className={inputClassName}
                          value={targetState[key].fit}
                          onChange={(event) =>
                            setTargetState((previous) => ({
                              ...previous,
                              [key]: {
                                ...previous[key],
                                fit: event.target.value as 'cover' | 'contain'
                              }
                            }))
                          }
                        >
                          <option value="cover">Cover</option>
                          <option value="contain">Contain</option>
                        </select>
                      </label>
                    </article>
                  ))}
                </div>

                {!selectedTargets ? (
                  <p className="mt-4 text-sm text-rose-200">Please enter valid width and height values for every enabled thumbnail.</p>
                ) : null}
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-5 py-10 text-center text-sm text-white/50">
                Pick a character from the list to configure its thumbnails.
              </div>
            )}
          </section>

          {selectedCharacter ? (
            <section className={sectionClassName}>
              <h2 className="font-[family-name:var(--font-heading)] text-[18px] font-normal text-white">Saved images</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                {renderPreviewPanel('Original preview', selectedCharacterDetails?.previewImageUrl ?? selectedCharacter.previewImageUrl, 'Kept as the source image.')}
                {renderPreviewPanel(
                  'Desktop thumbnail',
                  selectedCharacterDetails?.cardThumbnailDesktopUrl ?? null,
                  `${targetState.desktop.width} x ${targetState.desktop.height}`
                )}
                {renderPreviewPanel(
                  'Mobile thumbnail',
                  selectedCharacterDetails?.cardThumbnailMobileUrl ?? null,
                  `${targetState.mobile.width} x ${targetState.mobile.height}`
                )}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </AdminPageShell>
  )
}

export default CharacterThumbnailsPage
