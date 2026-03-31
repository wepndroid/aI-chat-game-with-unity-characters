import { Color } from '@tiptap/extension-color'
import { FontFamily } from '@tiptap/extension-font-family'
import Placeholder from '@tiptap/extension-placeholder'
import { TextStyle } from '@tiptap/extension-text-style'
import type { AnyExtension } from '@tiptap/core'
import type { ParseOptions } from '@tiptap/pm/model'
import StarterKit from '@tiptap/starter-kit'

/** Required so leading/trailing spaces and indentation survive HTML parse → document (editor + preview). */
export const FIRST_MESSAGE_PARSE_OPTIONS: ParseOptions = {
  preserveWhitespace: 'full'
}

export function getFirstMessageTiptapExtensions(options?: { placeholder?: string }): AnyExtension[] {
  const extensions: AnyExtension[] = [
    StarterKit.configure({
      heading: false,
      code: false,
      codeBlock: false,
      blockquote: false,
      bulletList: false,
      orderedList: false,
      horizontalRule: false
    }),
    TextStyle.configure({ mergeNestedSpanStyles: true }),
    Color.configure({ types: ['textStyle'] }),
    FontFamily.configure({ types: ['textStyle'] })
  ]

  if (options?.placeholder) {
    extensions.push(
      Placeholder.configure({
        placeholder: options.placeholder,
        emptyEditorClass: 'first-message-editor-placeholder'
      })
    )
  }

  return extensions
}
