import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveCharacterListThumbnailContract } from './character-list-thumbnail-contract'

const fullThumbnailRow = {
  previewImageUrl: 'https://cdn.example.test/preview.png',
  thumbnailReferenceImageUrl: 'https://cdn.example.test/reference.png',
  cardThumbnailDesktopUrl: 'https://cdn.example.test/desktop.png',
  cardThumbnailMobileUrl: 'https://cdn.example.test/mobile.png'
}

test('card thumbnails preserve stored desktop and mobile URLs while preferring mobile for thumbnailUrl', () => {
  assert.deepEqual(resolveCharacterListThumbnailContract(fullThumbnailRow, 'card'), {
    previewImageUrl: 'https://cdn.example.test/preview.png',
    thumbnailReferenceImageUrl: null,
    cardThumbnailDesktopUrl: 'https://cdn.example.test/desktop.png',
    cardThumbnailMobileUrl: 'https://cdn.example.test/mobile.png',
    thumbnailUrl: 'https://cdn.example.test/mobile.png'
  })
})

test('card thumbnails fall back to desktop when mobile is missing', () => {
  assert.deepEqual(
    resolveCharacterListThumbnailContract(
      {
        ...fullThumbnailRow,
        cardThumbnailMobileUrl: null
      },
      'card'
    ),
    {
      previewImageUrl: 'https://cdn.example.test/preview.png',
      thumbnailReferenceImageUrl: null,
      cardThumbnailDesktopUrl: 'https://cdn.example.test/desktop.png',
      cardThumbnailMobileUrl: null,
      thumbnailUrl: 'https://cdn.example.test/desktop.png'
    }
  )
})

test('reference thumbnails project the reference image across list image fields', () => {
  assert.deepEqual(resolveCharacterListThumbnailContract(fullThumbnailRow, 'reference'), {
    previewImageUrl: 'https://cdn.example.test/reference.png',
    thumbnailReferenceImageUrl: 'https://cdn.example.test/reference.png',
    cardThumbnailDesktopUrl: 'https://cdn.example.test/reference.png',
    cardThumbnailMobileUrl: 'https://cdn.example.test/reference.png',
    thumbnailUrl: 'https://cdn.example.test/reference.png'
  })
})
