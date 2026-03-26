'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'

export type ChatMessageRow = {
  id: string
  role: 'user' | 'character'
  body: string
}

type CharacterInlineChatPanelProps = {
  characterName: string
  messages: ChatMessageRow[]
  inputValue: string
  onInputChange: (value: string) => void
  onSend: () => void
  onClose: () => void
  isSending: boolean
  canSend: boolean
  signInHint: string | null
  playDemoHref: string
}

const CharacterInlineChatPanel = ({
  characterName,
  messages,
  inputValue,
  onInputChange,
  onSend,
  onClose,
  isSending,
  canSend,
  signInHint,
  playDemoHref
}: CharacterInlineChatPanelProps) => {
  const scrollReference = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const element = scrollReference.current
    if (!element) {
      return
    }
    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' })
  }, [messages])

  return (
    <div className="mt-4 rounded-md border border-ember-300/35 bg-[linear-gradient(180deg,#1a1210,#0d0b0b)] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ember-200">Chat with {characterName}</p>
          <p className="mt-1 text-[10px] leading-relaxed text-white/45">
            Demo chat on this page. Full AI runs in the game client — use the link below when you want the WebGL build.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md border border-white/25 bg-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/80 transition hover:border-ember-300/50 hover:text-white"
          aria-label="Close chat"
        >
          Close
        </button>
      </div>

      <div
        ref={scrollReference}
        className="mt-3 max-h-[min(340px,52vh)] space-y-2.5 overflow-y-auto rounded-md border border-white/8 bg-black/35 px-3 py-3"
        role="log"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <p className="text-center text-[11px] text-white/45">Loading…</p>
        ) : (
          messages.map((messageRow) => (
            <div
              key={messageRow.id}
              className={`max-w-[95%] rounded-md px-3 py-2 text-[11px] leading-relaxed ${
                messageRow.role === 'user'
                  ? 'ml-auto bg-ember-500/25 text-white/90'
                  : 'mr-auto border border-white/10 bg-[#141210] text-white/78'
              }`}
            >
              {messageRow.body}
            </div>
          ))
        )}
      </div>

      {signInHint ? (
        <p className="mt-3 text-center text-[11px] text-amber-200/90">{signInHint}</p>
      ) : (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                onSend()
              }
            }}
            placeholder="Type a message…"
            disabled={!canSend || isSending}
            className="min-h-10 flex-1 rounded-md border border-white/18 bg-black/40 px-3 text-xs text-white outline-none placeholder:text-white/35 focus:border-ember-300/60 disabled:opacity-50"
            aria-label="Chat message"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend || isSending || !inputValue.trim()}
            className="shrink-0 rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-black disabled:opacity-50"
          >
            {isSending ? '…' : 'Send'}
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-3">
        <Link
          href={playDemoHref}
          className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ember-300 underline-offset-2 transition hover:text-ember-200"
          aria-label="Open full game in browser"
        >
          Open full game in browser
        </Link>
      </div>
    </div>
  )
}

export default CharacterInlineChatPanel
