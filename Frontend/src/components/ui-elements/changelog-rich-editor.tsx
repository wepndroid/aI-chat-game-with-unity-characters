'use client'

import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { Node, mergeAttributes } from '@tiptap/core'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'
import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'

const ChangelogImageNode = Node.create({
  name: 'image',
  group: 'block',
  draggable: false,
  selectable: true,
  addAttributes() {
    return {
      src: {
        default: null
      },
      alt: {
        default: ''
      },
      title: {
        default: ''
      }
    }
  },
  parseHTML() {
    return [{ tag: 'img[src]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes)]
  }
})

const ToolbarButton = ({
  active,
  disabled,
  onClick,
  title,
  children
}: {
  active?: boolean
  disabled?: boolean
  onClick: () => void
  title: string
  children: ReactNode
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

type ChangelogRichEditorProps = {
  value: string
  onChange: (value: string) => void
  onUploadImage: (file: File) => Promise<string>
  disabled?: boolean
}

const ChangelogRichEditor = ({ value, onChange, onUploadImage, disabled = false }: ChangelogRichEditorProps) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit,
        ChangelogImageNode,
        Placeholder.configure({
          placeholder: 'Write patch notes, add screenshots, and format the update for players.'
        })
      ],
      content: value || '',
      editable: !disabled,
      editorProps: {
        attributes: {
          class:
            'max-w-none min-h-[260px] px-4 py-4 text-sm leading-7 text-white/95 focus:outline-none [&_blockquote]:border-l-2 [&_blockquote]:border-ember-400/50 [&_blockquote]:pl-4 [&_h1]:text-3xl [&_h1]:font-semibold [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:text-xl [&_h3]:font-semibold [&_img]:my-4 [&_img]:max-h-[420px] [&_img]:rounded-xl [&_img]:border [&_img]:border-white/10 [&_img]:object-contain [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-3 [&_ul]:list-disc [&_ul]:pl-6'
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

    if (editor.getHTML() !== value) {
      editor.commands.setContent(value || '', {
        emitUpdate: false
      })
    }
  }, [editor, value])

  const toolbarState = useEditorState({
    editor,
    selector: (context) => ({
      bold: context.editor?.isActive('bold') ?? false,
      italic: context.editor?.isActive('italic') ?? false,
      bulletList: context.editor?.isActive('bulletList') ?? false,
      orderedList: context.editor?.isActive('orderedList') ?? false,
      blockquote: context.editor?.isActive('blockquote') ?? false,
      headingTwo: context.editor?.isActive('heading', { level: 2 }) ?? false
    })
  })

  return (
    <div className="rounded-md border border-white/20 bg-black/35">
      <div className="flex flex-wrap items-center gap-1 border-b border-white/10 px-2 py-2">
        <ToolbarButton
          title="Bold"
          active={toolbarState?.bold ?? false}
          disabled={disabled || !editor}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          B
        </ToolbarButton>
        <ToolbarButton
          title="Italic"
          active={toolbarState?.italic ?? false}
          disabled={disabled || !editor}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          I
        </ToolbarButton>
        <ToolbarButton
          title="Section heading"
          active={toolbarState?.headingTwo ?? false}
          disabled={disabled || !editor}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          title="Bullet list"
          active={toolbarState?.bulletList ?? false}
          disabled={disabled || !editor}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          List
        </ToolbarButton>
        <ToolbarButton
          title="Numbered list"
          active={toolbarState?.orderedList ?? false}
          disabled={disabled || !editor}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          1.
        </ToolbarButton>
        <ToolbarButton
          title="Quote"
          active={toolbarState?.blockquote ?? false}
          disabled={disabled || !editor}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          Quote
        </ToolbarButton>
        <ToolbarButton
          title="Divider"
          disabled={disabled || !editor}
          onClick={() => editor?.chain().focus().setHorizontalRule().run()}
        >
          Rule
        </ToolbarButton>
        <ToolbarButton
          title="Upload image"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
        >
          Image
        </ToolbarButton>
      </div>

      <div className="bg-black">
        <EditorContent editor={editor} />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (!file || !editor) {
            return
          }

          void onUploadImage(file)
            .then((url) => {
              editor.chain().focus().insertContent(`<img src="${url}" alt="${file.name.replace(/"/g, '&quot;')}" />`).run()
            })
            .catch(() => {})

          event.currentTarget.value = ''
        }}
      />
    </div>
  )
}

export default ChangelogRichEditor
