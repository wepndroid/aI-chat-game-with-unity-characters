'use client'

import type { ReactNode } from 'react'

import { scenarioTypeDialogueAccentClass, type StoryScenarioType } from '@/lib/story-scenario-types'

/**
 * Preview semantics (write story / character cards):
 * `"dialogue"` → category color, not italic (spoken line).
 * Everything else (plain lines, `**stage direction**`) → gray italic (narration / description).
 * `*text*` → pink emphasis (optional; same mini-markup as character upload help).
 */
const DESCRIPTION_CLASS = 'italic font-serif text-[#9ca3af]'

export const STORY_BODY_FIELD_TEXTAREA_CLASS =
  'w-full max-w-full min-h-[120px] min-w-0 resize-y rounded-[10px] border border-white/15 bg-[#0b0b0b] px-3 py-2.5 text-sm leading-relaxed text-white outline-none transition-colors placeholder:text-white/35 hover:border-ember-400/75 focus-visible:border-ember-400/90 focus-visible:ring-1 focus-visible:ring-ember-400/25 disabled:cursor-not-allowed disabled:opacity-50'

type MarkupToken =
  | { kind: 'plain'; text: string }
  | { kind: 'action'; text: string }
  | { kind: 'pink'; text: string }
  | { kind: 'quoted'; text: string }

export function tokenizeStoryBodyMarkup(input: string): MarkupToken[] {
  const tokens: MarkupToken[] = []
  let i = 0

  const appendPlain = (chunk: string) => {
    if (!chunk) {
      return
    }
    const prev = tokens[tokens.length - 1]
    if (prev?.kind === 'plain') {
      prev.text += chunk
    } else {
      tokens.push({ kind: 'plain', text: chunk })
    }
  }

  while (i < input.length) {
    if (input[i] === '*' && input[i + 1] === '*') {
      const close = input.indexOf('**', i + 2)
      if (close !== -1) {
        tokens.push({ kind: 'action', text: input.slice(i + 2, close) })
        i = close + 2
        continue
      }
      appendPlain('*')
      i += 1
      continue
    }

    if (input[i] === '"') {
      const close = input.indexOf('"', i + 1)
      if (close !== -1) {
        tokens.push({ kind: 'quoted', text: input.slice(i + 1, close) })
        i = close + 1
        continue
      }
    }

    if (input[i] === '*' && input[i + 1] !== '*') {
      const close = input.indexOf('*', i + 1)
      if (close !== -1 && close > i + 1) {
        const inner = input.slice(i + 1, close)
        if (!inner.includes('**')) {
          tokens.push({ kind: 'pink', text: inner })
          i = close + 1
          continue
        }
      }
    }

    appendPlain(input[i]!)
    i += 1
  }

  return tokens
}

export function renderStoryBodyMarkupNodes(
  input: string,
  quotedAccentClassName: string
): ReactNode[] {
  const tokens = tokenizeStoryBodyMarkup(input)
  return tokens.map((t, idx) => {
    const key = `m-${idx}`
    switch (t.kind) {
      case 'plain':
        return (
          <span key={key} className={DESCRIPTION_CLASS}>
            {t.text}
          </span>
        )
      case 'action':
        return (
          <span key={key} className={DESCRIPTION_CLASS}>
            {t.text}
          </span>
        )
      case 'pink':
        return (
          <span key={key} className="font-serif italic text-pink-400">
            {t.text}
          </span>
        )
      case 'quoted':
        return (
          <span
            key={key}
            className={`font-serif font-normal not-italic ${quotedAccentClassName}`}
          >
            {`"${t.text}"`}
          </span>
        )
    }
  })
}

type StoryBodyMarkupPreviewProps = {
  text: string
  /** When empty, OTHER accent is used for `"…"` dialogue. */
  scenarioType?: StoryScenarioType | string | null
  className?: string
}

export const StoryBodyMarkupPreview = ({ text, scenarioType, className = '' }: StoryBodyMarkupPreviewProps) => {
  const accent = scenarioTypeDialogueAccentClass(scenarioType)
  const nodes = renderStoryBodyMarkupNodes(text, accent)
  return (
    <div
      className={`min-w-0 max-w-full whitespace-pre-wrap [overflow-wrap:anywhere] font-serif leading-relaxed ${className}`.trim()}
    >
      {nodes}
    </div>
  )
}
