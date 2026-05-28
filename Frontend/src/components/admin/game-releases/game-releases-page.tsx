'use client'

import AdminPageShell from '@/components/shared/admin-page-shell'
import {
  activateGameRelease,
  createWebglGameRelease,
  createWindowsGameRelease,
  deleteGameReleaseById,
  getAdminGameReleases,
  updateGameRelease,
  type GameReleasePlatform,
  type GameReleaseRecord,
  type UploadProgress
} from '@/lib/game-release-api'
import { getAdminNewsArticles, type NewsArticleRecord } from '@/lib/news-api'
import { useEffect, useMemo, useState } from 'react'

const sectionClassName = 'mt-6 rounded-2xl border border-white/10 bg-[#0c0f14]/95 px-4 py-5 sm:px-6'
const labelClassName = 'text-xs font-semibold uppercase tracking-[0.08em] text-white/65'
const inputClassName =
  'mt-1 w-full rounded-md border border-white/20 bg-[#0f1116]/90 px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/45 focus:border-ember-300 focus:ring-2 focus:ring-ember-400/35'

const formatBytes = (value: number | null) => {
  if (!value || value <= 0) {
    return null
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let size = value
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

const formatDateTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date)
}

const formatUploadProgress = (progress: UploadProgress | null) => {
  if (!progress) {
    return null
  }

  const loaded = formatBytes(progress.loaded) ?? '0 B'
  const total = progress.total !== null ? formatBytes(progress.total) ?? null : null
  return total ? `${loaded} / ${total}` : loaded
}

const GameReleasesPage = () => {
  const [releaseList, setReleaseList] = useState<GameReleaseRecord[]>([])
  const [newsArticleList, setNewsArticleList] = useState<NewsArticleRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [platform, setPlatform] = useState<GameReleasePlatform>('WINDOWS')
  const [editingReleaseId, setEditingReleaseId] = useState<string | null>(null)
  const [versionLabel, setVersionLabel] = useState('')
  const [selectedNewsArticleId, setSelectedNewsArticleId] = useState('')
  const [activateImmediately, setActivateImmediately] = useState(true)
  const [windowsFile, setWindowsFile] = useState<File | null>(null)
  const [webglArchiveFile, setWebglArchiveFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null)

  const loadData = async () => {
    const [releasePayload, newsPayload] = await Promise.all([getAdminGameReleases(), getAdminNewsArticles()])
    setReleaseList(releasePayload.data)
    setNewsArticleList(newsPayload.data)
  }

  useEffect(() => {
    let isCancelled = false

    Promise.resolve().then(async () => {
      setIsLoading(true)
      setErrorMessage(null)
      try {
        const [releasePayload, newsPayload] = await Promise.all([getAdminGameReleases(), getAdminNewsArticles()])
        if (!isCancelled) {
          setReleaseList(releasePayload.data)
          setNewsArticleList(newsPayload.data)
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load releases.')
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    })

    return () => {
      isCancelled = true
    }
  }, [])

  const resetForm = (nextPlatform: GameReleasePlatform = platform) => {
    setEditingReleaseId(null)
    setPlatform(nextPlatform)
    setVersionLabel('')
    setSelectedNewsArticleId('')
    setActivateImmediately(true)
    setWindowsFile(null)
    setWebglArchiveFile(null)
    setUploadProgress(null)
  }

  const groupedReleases = useMemo(
    () => ({
      WINDOWS: releaseList.filter((release) => release.platform === 'WINDOWS'),
      WEBGL: releaseList.filter((release) => release.platform === 'WEBGL')
    }),
    [releaseList]
  )

  const handleSubmit = async () => {
    setIsSaving(true)
    setErrorMessage(null)
    setSuccessMessage(null)
    setUploadProgress(null)

    try {
      if (editingReleaseId) {
        await updateGameRelease(editingReleaseId, {
          versionLabel,
          newsArticleId: selectedNewsArticleId || null
        })
        setSuccessMessage('Release metadata updated.')
      } else if (platform === 'WINDOWS') {
        if (!windowsFile) {
          throw new Error('Choose the Windows build file first.')
        }

        const formData = new FormData()
        formData.append('versionLabel', versionLabel)
        formData.append('newsArticleId', selectedNewsArticleId)
        formData.append('activate', String(activateImmediately))
        formData.append('artifact', windowsFile)
        await createWindowsGameRelease(formData, {
          onProgress: setUploadProgress
        })
        setSuccessMessage('Windows release uploaded.')
      } else {
        if (!webglArchiveFile) {
          throw new Error('Choose the WebGL zip file first.')
        }

        const formData = new FormData()
        formData.append('versionLabel', versionLabel)
        formData.append('newsArticleId', selectedNewsArticleId)
        formData.append('activate', String(activateImmediately))
        formData.append('archive', webglArchiveFile)
        await createWebglGameRelease(formData, {
          onProgress: setUploadProgress
        })
        setSuccessMessage('WebGL release uploaded.')
      }

      await loadData()
      resetForm(platform)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save the release.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AdminPageShell activeKey="game-releases">
      <h1 className="font-[family-name:var(--font-heading)] text-[22px] font-normal leading-tight text-white sm:text-[26px] md:text-[29px] md:leading-none">
        Game Releases
      </h1>
      <p className="mt-2 max-w-3xl text-sm text-[#95a6c1]">
        Upload platform builds, choose which version is live, and attach a reusable news article that players can open from the site.
      </p>
      {isLoading ? <p className="mt-4 text-sm text-white/70">Loading releases...</p> : null}
      {errorMessage ? <p className="mt-4 rounded-md border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">{errorMessage}</p> : null}
      {successMessage ? (
        <p className="mt-4 rounded-md border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100">{successMessage}</p>
      ) : null}

      <section className={sectionClassName}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-[family-name:var(--font-heading)] text-[21px] font-normal leading-none text-white">
              {editingReleaseId ? 'Edit Release Metadata' : 'Create Release'}
            </h2>
            <p className="mt-2 text-sm text-white/55">
              {editingReleaseId
                ? 'Update the version label or selected news article for an existing release.'
                : 'WebGL uploads now expect one zip file with index.html in the zip root.'}
            </p>
          </div>
          {editingReleaseId ? (
            <button
              type="button"
              className="rounded-md border border-white/15 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-white/75 transition hover:border-white/35 hover:text-white"
              onClick={() => resetForm(platform)}
              disabled={isSaving}
            >
              Cancel Edit
            </button>
          ) : null}
        </div>

        {!editingReleaseId ? (
          <div className="mt-5 inline-flex rounded-xl border border-white/10 bg-black/30 p-1">
            {(['WINDOWS', 'WEBGL'] as const).map((platformOption) => (
              <button
                key={platformOption}
                type="button"
                className={`rounded-lg px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] transition ${
                  platform === platformOption ? 'bg-ember-500 text-black' : 'text-white/70 hover:bg-white/5 hover:text-white'
                }`}
                onClick={() => resetForm(platformOption)}
                disabled={isSaving}
              >
                {platformOption}
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className={labelClassName}>Version label</span>
            <input
              className={inputClassName}
              value={versionLabel}
              onChange={(event) => setVersionLabel(event.target.value)}
              placeholder={platform === 'WINDOWS' ? 'v0.9.4 Windows Hotfix' : 'v0.9.4 WebGL'}
              disabled={isSaving}
            />
          </label>

          <label className="block">
            <span className={labelClassName}>News article</span>
            <select
              className={inputClassName}
              value={selectedNewsArticleId}
              onChange={(event) => setSelectedNewsArticleId(event.target.value)}
              disabled={isSaving}
            >
              <option value="">No linked article</option>
              {newsArticleList.map((article) => (
                <option key={article.id} value={article.id}>
                  {article.title}
                  {article.isPublished ? '' : ' (Draft)'}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!editingReleaseId ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-4">
            <p className={labelClassName}>Build upload</p>
            {platform === 'WINDOWS' ? (
              <>
                <input
                  type="file"
                  className="mt-3 block w-full text-sm text-white/80 file:mr-4 file:rounded-md file:border-0 file:bg-ember-500 file:px-3 file:py-2 file:text-xs file:font-semibold file:uppercase file:tracking-[0.08em] file:text-black"
                  onChange={(event) => setWindowsFile(event.target.files?.[0] ?? null)}
                  disabled={isSaving}
                />
                <p className="mt-3 text-xs text-white/55">
                  {windowsFile ? `${windowsFile.name} • ${formatBytes(windowsFile.size)}` : 'Choose the ZIP, EXE, or installer players should download.'}
                </p>
              </>
            ) : (
              <>
                <input
                  type="file"
                  accept=".zip,application/zip"
                  className="mt-3 block w-full text-sm text-white/80 file:mr-4 file:rounded-md file:border-0 file:bg-ember-500 file:px-3 file:py-2 file:text-xs file:font-semibold file:uppercase file:tracking-[0.08em] file:text-black"
                  onChange={(event) => setWebglArchiveFile(event.target.files?.[0] ?? null)}
                  disabled={isSaving}
                />
                <p className="mt-3 text-xs text-white/55">
                  {webglArchiveFile
                    ? `${webglArchiveFile.name} • ${formatBytes(webglArchiveFile.size)}`
                    : 'Choose one zip file. The zip root must contain index.html.'}
                </p>
              </>
            )}

            {uploadProgress ? (
              <div className="mt-4">
                <div className="h-3 rounded-full border border-white/10 bg-[#11141b] p-[2px]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-ember-400 to-ember-500 transition-[width] duration-150"
                    style={{ width: `${uploadProgress.percent ?? 0}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-white/55">
                  <span>{formatUploadProgress(uploadProgress)}</span>
                  <span>{uploadProgress.percent !== null ? `${Math.floor(uploadProgress.percent)}%` : 'Uploading...'}</span>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {!editingReleaseId ? (
          <label className="mt-4 flex cursor-pointer items-center gap-3 text-sm font-medium text-white/70">
            <input
              type="checkbox"
              checked={activateImmediately}
              onChange={(event) => setActivateImmediately(event.target.checked)}
              disabled={isSaving}
            />
            Make this the live player version immediately
          </label>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-5 text-[11px] font-bold uppercase tracking-[0.1em] text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isSaving || isLoading}
            onClick={() => {
              void handleSubmit()
            }}
          >
            {isSaving ? 'Saving...' : editingReleaseId ? 'Save Release Metadata' : `Upload ${platform} Release`}
          </button>
          {!editingReleaseId ? (
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-md border border-white/15 px-5 text-[11px] font-bold uppercase tracking-[0.1em] text-white/75 transition hover:border-white/35 hover:text-white"
              disabled={isSaving}
              onClick={() => resetForm(platform)}
            >
              Clear Form
            </button>
          ) : null}
        </div>
      </section>

      {(['WINDOWS', 'WEBGL'] as const).map((platformKey) => (
        <section key={platformKey} className={sectionClassName}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-[family-name:var(--font-heading)] text-[21px] font-normal leading-none text-white">{platformKey} Versions</h2>
              <p className="mt-2 text-sm text-white/55">
                Activate an older version to roll back immediately. Delete only removes inactive versions.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {groupedReleases[platformKey].length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-5 text-sm text-white/55">
                No {platformKey.toLowerCase()} releases uploaded yet.
              </div>
            ) : (
              groupedReleases[platformKey].map((release) => (
                <article key={release.id} className="rounded-xl border border-white/10 bg-black/20 px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-white">{release.versionLabel}</h3>
                        {release.isActive ? (
                          <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-200">
                            Live
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-xs text-white/50">
                        Uploaded {formatDateTime(release.createdAt)}
                        {release.fileCount ? ` • ${release.fileCount} files` : ''}
                        {release.totalBytes ? ` • ${formatBytes(release.totalBytes)}` : ''}
                      </p>
                      <p className="mt-2 text-xs text-white/60">
                        News: {release.newsArticle ? release.newsArticle.title : 'No linked article'}
                      </p>
                      <p className="mt-2 break-all text-xs text-white/45">Download: {release.downloadUrl}</p>
                      {release.platform === 'WEBGL' ? (
                        <p className="mt-1 break-all text-xs text-white/45">Runtime: {release.runtimeUrl}</p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {!release.isActive ? (
                        <button
                          type="button"
                          className="rounded-md border border-emerald-300/30 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-emerald-100 transition hover:border-emerald-300/60"
                          disabled={isSaving}
                          onClick={() => {
                            void (async () => {
                              setIsSaving(true)
                              setErrorMessage(null)
                              setSuccessMessage(null)
                              try {
                                await activateGameRelease(release.id)
                                await loadData()
                                setSuccessMessage(`${release.versionLabel} is now live.`)
                              } catch (error) {
                                setErrorMessage(error instanceof Error ? error.message : 'Failed to activate release.')
                              } finally {
                                setIsSaving(false)
                              }
                            })()
                          }}
                        >
                          Make Live
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="rounded-md border border-white/15 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-white/75 transition hover:border-white/35 hover:text-white"
                        disabled={isSaving}
                        onClick={() => {
                          setEditingReleaseId(release.id)
                          setPlatform(release.platform)
                          setVersionLabel(release.versionLabel)
                          setSelectedNewsArticleId(release.newsArticleId ?? '')
                          setActivateImmediately(release.isActive)
                          setWindowsFile(null)
                          setWebglArchiveFile(null)
                          setUploadProgress(null)
                          setSuccessMessage(null)
                          setErrorMessage(null)
                          window.scrollTo({ top: 0, behavior: 'smooth' })
                        }}
                      >
                        Edit
                      </button>
                      {!release.isActive ? (
                        <button
                          type="button"
                          className="rounded-md border border-rose-300/30 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-rose-100 transition hover:border-rose-300/60"
                          disabled={isSaving}
                          onClick={() => {
                            void (async () => {
                              setIsSaving(true)
                              setErrorMessage(null)
                              setSuccessMessage(null)
                              try {
                                await deleteGameReleaseById(release.id)
                                await loadData()
                                setSuccessMessage(`${release.versionLabel} was deleted.`)
                                if (editingReleaseId === release.id) {
                                  resetForm(release.platform)
                                }
                              } catch (error) {
                                setErrorMessage(error instanceof Error ? error.message : 'Failed to delete release.')
                              } finally {
                                setIsSaving(false)
                              }
                            })()
                          }}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      ))}
    </AdminPageShell>
  )
}

export default GameReleasesPage
