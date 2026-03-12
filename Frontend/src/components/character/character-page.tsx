'use client'

import ChatMessageBubble from '@/components/ui-elements/chat-message-bubble'
import CharacterStatTile from '@/components/ui-elements/character-stat-tile'
import CommentsPanel from '@/components/ui-elements/comments-panel'

type CharacterStat = {
  id: string
  icon: string
  value: string
  label: string
}

type ConversationLine = {
  id: string
  message: string
  align?: 'left' | 'right'
}

const characterStats: CharacterStat[] = [
  { id: 'total-chats', icon: 'x', value: '102', label: 'Total Chats' },
  { id: 'likes', icon: 'o', value: '74', label: 'Likes' },
  { id: 'uploaded-by', icon: '*', value: 'reKongator2', label: 'Uploaded By' }
]

const conversationPreview: ConversationLine[] = [
  {
    id: 'line-1',
    message: 'An early supporter who helped rank this genre possible.'
  },
  {
    id: 'line-2',
    message: 'I thought maybe we could talk a little before jumping into roleplay.',
    align: 'right'
  },
  {
    id: 'line-3',
    message: 'She fidgets with her sleeves, looking up with hopeful eyes.'
  },
  {
    id: 'line-4',
    message: 'I really want us to get along. So, would it be okay if I sat with you for a bit?',
    align: 'right'
  }
]

const CharacterPreviewVisual = () => {
  return (
    <div className="relative mx-auto flex h-[420px] w-[210px] items-end justify-center overflow-hidden rounded-sm border border-white/10 bg-[linear-gradient(to_bottom,#a7bbcb_0%,#546377_45%,#1d2530_100%)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_8%,rgba(255,255,255,0.4),transparent_35%)]" />
      <div className="absolute left-1/2 top-[78px] h-14 w-14 -translate-x-1/2 rounded-full bg-[#f8c5a5]" />
      <div className="absolute left-1/2 top-[130px] h-[170px] w-[92px] -translate-x-1/2 rounded-t-[40px] rounded-b-[16px] bg-white/90" />
      <div className="absolute left-1/2 top-[186px] h-[84px] w-[70px] -translate-x-1/2 rounded-t-[20px] bg-[#ff4f59]/70" />
      <div className="absolute bottom-0 left-1/2 h-[120px] w-[92px] -translate-x-1/2 bg-[linear-gradient(to_top,#2c3748,#1f2a3b)]" />
    </div>
  )
}

const CharacterPage = () => {
  return (
    <main className="relative overflow-hidden bg-[#030303] text-white">
      <section className="relative border-b border-white/10 px-5 py-10 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(244,99,19,0.12),transparent_35%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:22px_22px] opacity-45" />

        <div className="relative z-10 mx-auto w-full max-w-[1150px] pt-24">
          <h1 className="text-center font-[family-name:var(--font-heading)] text-5xl font-semibold italic text-white md:text-6xl">
            AI Girlfriend
          </h1>

          <div className="mt-10 grid gap-5 lg:grid-cols-[1.28fr_1fr]">
            <div>
              <div className="relative rounded-md border border-white/10 bg-[linear-gradient(to_right,#3f2b1b,#1f1a1a_38%,#0e0f14)] px-5 py-5 md:px-7">
                <button
                  type="button"
                  className="absolute right-4 top-4 inline-flex h-9 items-center justify-center rounded-md border border-white/35 bg-white/95 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#1d1d1d]"
                  aria-label="Open 3D preview"
                >
                  3D Preview
                </button>
                <CharacterPreviewVisual />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {characterStats.map((statItem) => (
                  <CharacterStatTile key={statItem.id} icon={statItem.icon} value={statItem.value} label={statItem.label} />
                ))}
              </div>

              <div className="mt-4">
                <CommentsPanel
                  username="Wooblord93"
                  postAge="3 days ago"
                  message="Hi everybody! your character however maybe she is a little too excited so I gave it to be tame so her talk will be time. Would it be possible to fix this?"
                />
              </div>
            </div>

            <div className="rounded-md border border-white/10 bg-[#1a1414] p-5 md:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-[family-name:var(--font-heading)] text-[42px] font-semibold italic leading-none text-white">Airi Akizuki</h2>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.11em] text-white/50">Easy | Seduced</p>
                </div>
                <button
                  type="button"
                  className="inline-flex size-7 items-center justify-center rounded-full border border-white/30 text-xs text-white/60"
                  aria-label="Add to favorites"
                >
                  o
                </button>
              </div>

              <div className="mt-6">
                <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-amber-300">Description</p>
                <p className="mt-3 text-[11px] leading-[1.5] text-white/70">
                  Airi Akizuki is a cheerful and slightly clumsy girl with a soft, warm presence. She has long blond hair tied with ribbons, bright expressive eyes, and speaks in a playful tone. With every smile and teasing remark, she draws you into
                  comfort that feels both cozy and electric.
                </p>
                <p className="mt-3 text-[11px] leading-[1.5] text-white/70">
                  Even though she often appears shy at first, she has a hardworking spirit and a kind heart that tries her best in everything she does.
                </p>
              </div>

              <div className="mt-6">
                <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-amber-300">First Message Preview</p>
                <div className="mt-3 space-y-2 rounded-md border border-amber-300/25 bg-[#161111] p-3">
                  {conversationPreview.map((lineItem) => (
                    <ChatMessageBubble key={lineItem.id} message={lineItem.message} align={lineItem.align} />
                  ))}
                </div>
              </div>

              <button
                type="button"
                className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-5 font-[family-name:var(--font-heading)] text-[30px] font-semibold italic leading-none text-white transition hover:brightness-110"
                aria-label="Start chat"
              >
                Start Chat
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default CharacterPage
