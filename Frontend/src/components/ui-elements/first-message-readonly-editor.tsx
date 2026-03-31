'use client'

import { EditorContent, useEditor } from '@tiptap/react'
import { useEffect, useMemo } from 'react'

import StartChatIcon from '@/components/ui-elements/start-chat-icon'
import { FIRST_MESSAGE_PARSE_OPTIONS, getFirstMessageTiptapExtensions } from '@/lib/first-message-tiptap-extensions'
import { firstMessageToEditorHtml, isEmptyFirstMessageHtml } from '@/lib/first-message-preview'
import { sanitizeFirstMessageHtml } from '@/lib/sanitize-first-message-html'

/** Same ProseMirror surface + classes as the rich editor body (no toolbar) — matches the edit field pixel-for-pixel. */
const PROSE_MIRROR_BODY_CLASS =
  'first-message-prosemirror first-message-prosemirror-readonly max-w-none min-h-[220px] px-3 py-3 text-[13px] leading-relaxed text-white/95 outline-none [&_p]:my-1 [&_p:first-child]:mt-0'

/** Shown only when there is no stored message (not persisted). */
const EMPTY_READ_ONLY_HTML = `<p><span style="color:rgba(255,255,255,0.45);font-style:italic">No first-message preview has been added yet.</span></p>`

const FirstMessageChatIcon = ({ className = 'size-7 shrink-0' }: { className?: string }) => (
  <StartChatIcon className={className} />
)

type FirstMessageReadOnlyEditorProps = {
  firstMessage: string | null | undefined
  className?: string
  /** When true, wraps the same bordered shell as the upload rich editor content area. */
  matchEditorChrome?: boolean
  /** Title + chat icon above the editor (outside the bordered editor), e.g. on the character page. */
  showHeader?: boolean
}

const FirstMessageReadOnlyEditor = ({
  firstMessage,
  className = '',
  matchEditorChrome = true,
  showHeader = false
}: FirstMessageReadOnlyEditorProps) => {
  const { safeHtml, isEmpty } = useMemo(() => {
    const raw = firstMessage ?? ''
    const converted = firstMessageToEditorHtml(raw)
    const safe = sanitizeFirstMessageHtml(converted)
    return {
      safeHtml: safe,
      isEmpty: isEmptyFirstMessageHtml(safe)
    }
  }, [firstMessage])

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: getFirstMessageTiptapExtensions(),
      content: '',
      parseOptions: FIRST_MESSAGE_PARSE_OPTIONS,
      editable: false,
      editorProps: {
        attributes: {
          class: PROSE_MIRROR_BODY_CLASS,
          'aria-readonly': 'true',
          tabIndex: '-1'
        }
      }
    },
    []
  )

  useEffect(() => {
    if (!editor) {
      return
    }
    const next = isEmpty ? EMPTY_READ_ONLY_HTML : safeHtml
    const current = editor.getHTML()
    if (current !== next) {
      editor.commands.setContent(next, { emitUpdate: false, parseOptions: FIRST_MESSAGE_PARSE_OPTIONS })
    }
  }, [editor, isEmpty, safeHtml])

  const inner = (
    <div
      className={`relative ${
        matchEditorChrome && !showHeader ? 'bg-black' : 'bg-transparent'
      } ${className}`.trim()}
    >
      <EditorContent editor={editor} />
    </div>
  )

  const editorChrome = matchEditorChrome && !showHeader ? (
    <div className="rounded-md border border-white/20 bg-black/35">{inner}</div>
  ) : (
    inner
  )

  if (!showHeader) {
    return editorChrome
  }

  return (
    <div className="rounded-md border border-white/20 bg-black/35 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="font-[family-name:var(--font-heading)] text-[10px] font-bold uppercase tracking-[0.12em] text-[#f59e0b]">
          First message preview
        </p>
        <FirstMessageChatIcon className="size-7 shrink-0 text-[#6b4423]/90" />
      </div>
      {editorChrome}
    </div>
  )
}

export default FirstMessageReadOnlyEditor
