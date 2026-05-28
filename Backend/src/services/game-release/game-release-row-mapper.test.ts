import test from 'node:test'
import assert from 'node:assert/strict'

import { mapGameReleaseRow } from './game-release-row-mapper'

const makeRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'release-1',
  platform: 'WEBGL',
  versionLabel: 'v0.31',
  artifactUrl: '/uploads/releases/webgl/v0.31/index.html',
  runtimeUrl: '',
  downloadUrl: '',
  artifactFileName: 'secretwaifu-webgl.zip',
  storagePath: 'game-releases/webgl/release-1',
  totalBytes: 1024n,
  fileCount: 7,
  isActive: 1,
  releaseNewsArticleId: 'news-release-fk',
  createdAt: '2026-05-18T08:00:00.000Z',
  updatedAt: '2026-05-18T08:05:00.000Z',
  deletedAt: null,
  joinedNewsArticleId: 'news-joined-row',
  newsArticleSlug: 'release-notes',
  newsArticleTitle: 'Release Notes',
  newsArticleSummary: 'Latest WebGL release',
  newsArticlePublished: 1,
  ...overrides
})

test('mapGameReleaseRow keeps release foreign key separate from joined article identity', () => {
  const record = mapGameReleaseRow(makeRow())

  assert.equal(record.newsArticleId, 'news-release-fk')
  assert.equal(record.newsArticle?.id, 'news-joined-row')
  assert.equal(record.newsArticle?.slug, 'release-notes')
  assert.equal(record.newsArticle?.title, 'Release Notes')
  assert.equal(record.newsArticle?.summary, 'Latest WebGL release')
  assert.equal(record.newsArticle?.isPublished, true)
})

test('mapGameReleaseRow preserves the release article reference when no article row joins', () => {
  const record = mapGameReleaseRow(
    makeRow({
      joinedNewsArticleId: null,
      newsArticleSlug: null,
      newsArticleTitle: null,
      newsArticleSummary: null,
      newsArticlePublished: null
    })
  )

  assert.equal(record.newsArticleId, 'news-release-fk')
  assert.equal(record.newsArticle, null)
})

test('mapGameReleaseRow ignores an accidental legacy duplicate alias', () => {
  const record = mapGameReleaseRow(
    makeRow({
      newsArticleId: 'ambiguous-legacy-column',
      releaseNewsArticleId: null,
      joinedNewsArticleId: 'news-joined-row'
    })
  )

  assert.equal(record.newsArticleId, null)
  assert.equal(record.newsArticle?.id, 'news-joined-row')
})

test('mapGameReleaseRow falls back missing runtime and download URLs to the artifact URL', () => {
  const record = mapGameReleaseRow(makeRow({ runtimeUrl: null, downloadUrl: '   ' }))

  assert.equal(record.artifactUrl, '/uploads/releases/webgl/v0.31/index.html')
  assert.equal(record.runtimeUrl, '/uploads/releases/webgl/v0.31/index.html')
  assert.equal(record.downloadUrl, '/uploads/releases/webgl/v0.31/index.html')
})
