// Migration lifecycle: final-migration-required support code. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import { redactText } from './redaction'

class UsageError extends Error {}

type ParsedCliArgs = {
  options: Map<string, string>
  flags: Set<string>
  positional: string[]
}

const parseCliArgs = (argv = process.argv.slice(2)): ParsedCliArgs => {
  const options = new Map<string, string>()
  const flags = new Set<string>()
  const positional: string[] = []

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }

    const withoutPrefix = arg.slice(2)
    const equalsIndex = withoutPrefix.indexOf('=')
    if (equalsIndex >= 0) {
      options.set(withoutPrefix.slice(0, equalsIndex), withoutPrefix.slice(equalsIndex + 1))
      continue
    }

    const next = argv[index + 1]
    if (next && !next.startsWith('--')) {
      options.set(withoutPrefix, next)
      index += 1
    } else {
      flags.add(withoutPrefix)
    }
  }

  return { options, flags, positional }
}

const requireOption = (args: ParsedCliArgs, name: string, positionalFallbackIndex?: number) => {
  const npmConfigName = `npm_config_${name.replace(/-/g, '_')}`
  const rawValue = (args.options.get(name) ?? process.env[npmConfigName])?.trim()
  const fallbackValue =
    rawValue === undefined || rawValue === '' || rawValue === 'true'
      ? positionalFallbackIndex === undefined
        ? undefined
        : args.positional[positionalFallbackIndex]
      : rawValue
  const value = fallbackValue?.trim()
  if (!value) {
    throw new UsageError(`Missing required --${name} option.`)
  }

  return value
}

const hasFlag = (args: ParsedCliArgs, name: string) => {
  const npmConfigValue = process.env[`npm_config_${name.replace(/-/g, '_')}`]
  return args.flags.has(name) || args.options.get(name) === 'true' || npmConfigValue === 'true' || npmConfigValue === ''
}

const runCli = async (fn: () => Promise<void>) => {
  try {
    await fn()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(redactText(message))
    process.exitCode = error instanceof UsageError ? 2 : 1
  }
}

export { UsageError, hasFlag, parseCliArgs, requireOption, runCli }
export type { ParsedCliArgs }
