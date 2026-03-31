'use client'

import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { useEffect } from 'react'

import { FIRST_MESSAGE_PARSE_OPTIONS, getFirstMessageTiptapExtensions } from '@/lib/first-message-tiptap-extensions'
import { FIRST_MESSAGE_MAX_LENGTH } from '@/lib/first-message-preview'

const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: 'Default', value: '' },
  { label: 'System UI', value: 'system-ui, sans-serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Mono', value: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
  { label: 'Heading (site)', value: 'var(--font-heading), ui-serif, Georgia, serif' }
]

const PRESET_COLORS = ['#e5e5e5', '#f59e0b', '#fb7185', '#a78bfa', '#38bdf8', '#4ade80', '#ffffff']

type FirstMessageRichEditorProps = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  id?: string
  'aria-describedby'?: string
}

const ToolbarButton = ({
  active,
  disabled,
  onClick,
  children,
  title
}: {
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
  title: string
}) => (
  <button
    type="button"
    title={title}
    disabled={disabled}
    onClick={onClick}
    className={`rounded px-2 py-1 text-[11px] font-semibold transition disabled:opacity-40 ${
      active ? 'bg-ember-500/35 text-ember-100' : 'text-white/80 hover:bg-white/10'
    }`}
  >
    {children}
  </button>
)

const FirstMessageRichEditor = ({
  value,
  onChange,
  disabled = false,
  placeholder = 'Write the opening message. Select text and use font, color, and styles below.',
  id,
  'aria-describedby': ariaDescribedBy
}: FirstMessageRichEditorProps) => {
  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: getFirstMessageTiptapExtensions({ placeholder }),
      content: value || '',
      parseOptions: FIRST_MESSAGE_PARSE_OPTIONS,
      editable: !disabled,
      editorProps: {
        attributes: {
          ...(id ? { id } : {}),
          ...(ariaDescribedBy ? { 'aria-describedby': ariaDescribedBy } : {}),
          class:
            'first-message-prosemirror max-w-none min-h-[220px] px-3 py-3 text-[13px] leading-relaxed text-white/95 focus:outline-none [&_p]:my-1 [&_p:first-child]:mt-0'
        }
      },
      onUpdate: ({ editor: instance }) => {
        onChange(instance.getHTML())
      }
    },
    [disabled]
  )

  useEffect(() => {
    if (!editor) {
      return
    }
    editor.setEditable(!disabled)
  }, [disabled, editor])

  useEffect(() => {
    if (!editor) {
      return
    }
    const current = editor.getHTML()
    if (value !== current) {
      editor.commands.setContent(value || '', {
        emitUpdate: false,
        parseOptions: FIRST_MESSAGE_PARSE_OPTIONS
      })
    }
  }, [value, editor])

  const toolbarState = useEditorState({
    editor,
    selector: (ctx) => {
      const ed = ctx.editor
      if (!ed) {
        return {
          bold: false,
          italic: false,
          underline: false,
          strike: false,
          color: '',
          fontFamily: ''
        }
      }
      return {
        bold: ed.isActive('bold'),
        italic: ed.isActive('italic'),
        underline: ed.isActive('underline'),
        strike: ed.isActive('strike'),
        color: (ed.getAttributes('textStyle').color as string | undefined) ?? '',
        fontFamily: (ed.getAttributes('textStyle').fontFamily as string | undefined) ?? ''
      }
    }
  })

  const htmlLength = editor?.getHTML().length ?? value.length

  return (
    <div className="rounded-md border border-white/20 bg-black/35">
      <div className="flex flex-wrap items-center gap-1 border-b border-white/10 px-2 py-2">
        <span className="mr-1 px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/40">Format</span>
        <ToolbarButton
          title="Bold"
          disabled={disabled || !editor}
          active={toolbarState?.bold ?? false}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          B
        </ToolbarButton>
        <ToolbarButton
          title="Italic"
          disabled={disabled || !editor}
          active={toolbarState?.italic ?? false}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          I
        </ToolbarButton>
        <ToolbarButton
          title="Underline"
          disabled={disabled || !editor}
          active={toolbarState?.underline ?? false}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        >
          U
        </ToolbarButton>
        <ToolbarButton
          title="Strikethrough"
          disabled={disabled || !editor}
          active={toolbarState?.strike ?? false}
          onClick={() => editor?.chain().focus().toggleStrike().run()}
        >
          S
        </ToolbarButton>

        <span className="mx-1 h-4 w-px bg-white/15" aria-hidden />

        <label className="flex items-center gap-1.5 px-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-white/45">Color</span>
          <input
            type="color"
            disabled={disabled || !editor}
            value={toolbarState?.color && /^#[0-9A-Fa-f]{6}$/.test(toolbarState.color) ? toolbarState.color : '#e5e5e5'}
            onChange={(event) => {
              editor?.chain().focus().setColor(event.target.value).run()
            }}
            className="h-7 w-10 cursor-pointer rounded border border-white/20 bg-transparent p-0 disabled:opacity-40"
            title="Text color"
          />
        </label>

        <div className="flex flex-wrap items-center gap-1">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              disabled={disabled || !editor}
              title={`Color ${c}`}
              className="size-5 rounded border border-white/20"
              style={{ backgroundColor: c }}
              onClick={() => editor?.chain().focus().setColor(c).run()}
            />
          ))}
        </div>

        <span className="mx-1 h-4 w-px bg-white/15" aria-hidden />

        <label className="flex items-center gap-2 px-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-white/45">Font</span>
          <select
            disabled={disabled || !editor}
            value={toolbarState?.fontFamily ?? ''}
            onChange={(event) => {
              const v = event.target.value
              if (!v) {
                editor?.chain().focus().unsetFontFamily().run()
              } else {
                editor?.chain().focus().setFontFamily(v).run()
              }
            }}
            className="max-w-[200px] rounded border border-white/20 bg-[#1a1414] px-2 py-1 text-[11px] text-white outline-none focus:border-ember-400/50 disabled:opacity-40"
          >
            {FONT_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="relative bg-black">
        <EditorContent editor={editor} />
        <span className="pointer-events-none absolute bottom-2 right-2 text-[10px] font-medium tabular-nums text-white/35" aria-hidden>
          {Math.min(htmlLength, FIRST_MESSAGE_MAX_LENGTH)} / {FIRST_MESSAGE_MAX_LENGTH}
        </span>
      </div>

      {htmlLength > FIRST_MESSAGE_MAX_LENGTH ? (
        <p className="border-t border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[10px] text-rose-200">
          Content exceeds the save limit. Remove text or formatting until the counter is within range.
        </p>
      ) : null}
    </div>
  )
}

export default FirstMessageRichEditor
