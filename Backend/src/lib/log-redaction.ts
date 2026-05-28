const REDACTED_VALUE = '[REDACTED]'

const secretAssignmentKeyPattern =
  '(?:authorization|cookie|set-cookie|api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|bearer[_-]?token|session[_-]?token|jwt|password|pass|smtp[_-]?pass|smtp[_-]?password|client[_-]?secret|oauth[_-]?secret|patreon[_-]?secret|patreon[_-]?client[_-]?secret|[a-z0-9_]*(?:_token|_secret|_key|_password))'

const redactLogText = (value: string) => {
  let redacted = value

  redacted = redacted.replace(
    /\b(stream_token|access_token|refresh_token|id_token|launch_token|token)=([^&\s]+)/gi,
    (_match, key: string) => `${key}=${REDACTED_VALUE}`
  )
  redacted = redacted.replace(
    /\b(authorization\s*[:=]\s*bearer\s+)([a-z0-9._~+/-]+=*)/gi,
    (_match, prefix: string) => `${prefix}${REDACTED_VALUE}`
  )
  redacted = redacted.replace(/\b(bearer\s+)([a-z0-9._~+/-]{16,}=*)/gi, (_match, prefix: string) => `${prefix}${REDACTED_VALUE}`)
  redacted = redacted.replace(
    /\b((?:authorization|cookie|set-cookie)\s*[:=]\s*)([^\n\r]+)/gi,
    (_match, prefix: string) => `${prefix}${REDACTED_VALUE}`
  )
  redacted = redacted.replace(
    new RegExp(`(["']?${secretAssignmentKeyPattern}["']?\\s*[:=]\\s*)(["'])([^\\r\\n]*?)(\\2)`, 'gi'),
    (_match, prefix: string, quote: string) => `${prefix}${quote}${REDACTED_VALUE}${quote}`
  )
  redacted = redacted.replace(
    new RegExp(`(["']?${secretAssignmentKeyPattern}["']?\\s*[:=]\\s*)([^"',;&\\s}\\\\]+)`, 'gi'),
    (_match, prefix: string) => `${prefix}${REDACTED_VALUE}`
  )
  redacted = redacted.replace(
    /\b([A-Z0-9_]*(?:TOKEN|SECRET|KEY|PASSWORD)[A-Z0-9_]*\s*=\s*)([^\s]+)/g,
    (_match, prefix: string) => `${prefix}${REDACTED_VALUE}`
  )

  return redacted
}

export { redactLogText }
