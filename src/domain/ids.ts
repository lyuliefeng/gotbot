export function hashString(input: string): string {
  let hash = 5381
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index)
  }
  return Math.abs(hash >>> 0).toString(36)
}

const seenPrompts = new Map<string, string>()

export function stableId(prefix: string, value: string): string {
  // 缓存键必须包含 prefix：相同 value 在不同 prefix 下应生成不同 id，
  // 否则先以 'prompt' 注册、再以 'builtin-docs' 查询会得到串号 id。
  const cacheKey = `${prefix}::${value}`
  const existing = seenPrompts.get(cacheKey)
  if (existing) return existing
  const id = `${prefix}-${hashString(value)}`
  seenPrompts.set(cacheKey, id)
  return id
}

export function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
