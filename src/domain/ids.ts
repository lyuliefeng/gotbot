export function hashString(input: string): string {
  let hash = 5381
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index)
  }
  return Math.abs(hash >>> 0).toString(36)
}

const seenPrompts = new Map<string, string>()

export function stableId(prefix: string, value: string): string {
  const existing = seenPrompts.get(value)
  if (existing) return existing
  const id = `${prefix}-${hashString(value)}`
  seenPrompts.set(value, id)
  return id
}

export function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
