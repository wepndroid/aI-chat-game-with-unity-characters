import type { DefaultHomepageResponse } from './landing-page-api'

const DEFAULT_HOMEPAGE_FALLBACK_SELECT_VALUE = '__fallback_default_homepage__'

type DefaultHomepageSetting = DefaultHomepageResponse['data']

const getDefaultHomepageFallbackSelectValue = () => DEFAULT_HOMEPAGE_FALLBACK_SELECT_VALUE

const resolveDefaultHomepageSelectionValue = (setting: DefaultHomepageSetting | null) => {
  if (!setting) {
    return ''
  }

  return setting.landingPage?.id ?? DEFAULT_HOMEPAGE_FALLBACK_SELECT_VALUE
}

const hasDefaultHomepageSelection = (selectionValue: string) => selectionValue.trim().length > 0

const resolveDefaultHomepageLandingPageId = (selectionValue: string) => {
  const normalizedValue = selectionValue.trim()

  if (!normalizedValue) {
    throw new Error('Select a landing page or the fallback homepage.')
  }

  return normalizedValue === DEFAULT_HOMEPAGE_FALLBACK_SELECT_VALUE ? null : normalizedValue
}

const buildDefaultHomepageSuccessMessage = (setting: DefaultHomepageSetting) =>
  setting.landingPage
    ? `Default homepage set to ${setting.landingPage.name}.`
    : `Default homepage reset to fallback ${setting.fallbackKey}.`

export {
  buildDefaultHomepageSuccessMessage,
  getDefaultHomepageFallbackSelectValue,
  hasDefaultHomepageSelection,
  resolveDefaultHomepageLandingPageId,
  resolveDefaultHomepageSelectionValue
}
