import DOMPurify from 'isomorphic-dompurify'

export function sanitizeStaticPageHtml(html: string): string {
  return DOMPurify.sanitize(html.trim(), {
    ALLOWED_TAGS: [
      'a',
      'b',
      'blockquote',
      'br',
      'div',
      'em',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'hr',
      'img',
      'i',
      'li',
      'ol',
      'p',
      'span',
      'strong',
      'table',
      'tbody',
      'td',
      'th',
      'thead',
      'tr',
      'u',
      'ul'
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'title', 'width', 'height', 'data-escaped-char'],
    ALLOW_DATA_ATTR: false
  })
}
