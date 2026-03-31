import DOMPurify from 'isomorphic-dompurify'

export function sanitizeFirstMessageHtml(html: string): string {
  return DOMPurify.sanitize(html.trim(), {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'span', 'div'],
    ALLOWED_ATTR: ['style', 'class'],
    ALLOW_DATA_ATTR: false
  })
}
