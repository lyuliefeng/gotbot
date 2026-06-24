import type { PromptItem } from '@/types'
import { hashString, stableId } from '@/domain/ids'

type RawPrompt = Record<string, unknown>

const knownSources = ['glidea', 'EvoLinkAI', 'freestylefly'] as const

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
}

function readArray(data: unknown): RawPrompt[] {
  if (Array.isArray(data)) return data.filter((item): item is RawPrompt => !!item && typeof item === 'object')
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    for (const key of ['prompts', 'items', 'data']) {
      if (Array.isArray(record[key])) return record[key] as RawPrompt[]
    }
  }
  return []
}

function normalizeSource(source: PromptItem['source']): PromptItem['source'] {
  return knownSources.includes(source as (typeof knownSources)[number]) ? source : 'custom'
}

function detectSource(filename: string): PromptItem['source'] {
  const lower = filename.toLowerCase()
  if (lower.includes('glidea')) return 'glidea'
  if (lower.includes('evolink')) return 'EvoLinkAI'
  if (lower.includes('freestylefly')) return 'freestylefly'
  return 'custom'
}

export function normalizeBilingualPromptMarkdown(content: string): PromptItem[] {
  const items: PromptItem[] = []
  const lines = content.split(/\r?\n/)
  let category = '文生图'
  let subCategory = ''

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+?)\s*$/)
    const h3 = line.match(/^###\s+(.+?)\s*$/)
    if (h2) {
      category = h2[1].trim()
      subCategory = ''
      continue
    }
    if (h3) {
      subCategory = h3[1].trim()
      continue
    }
    if (!line.trim().startsWith('|')) continue
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
    if (cells.length < 3 || !/^\d+$/.test(cells[0])) continue
    const promptZh = cells[1]
    const promptEn = cells[2]
    if (!promptZh || !promptEn || promptZh.includes('中文') || promptEn.includes('英文')) continue
    const sourceId = stableId('builtin', `${category}-${subCategory}-${cells[0]}-${promptEn}`)
    items.push({
      id: stableId('prompt', `${sourceId}-${promptEn}`),
      title: `${subCategory || category} ${cells[0]}`,
      prompt: promptEn,
      promptZh,
      promptEn,
      language: 'bilingual',
      source: 'builtin',
      sourceId,
      category,
      subCategory,
      author: 'SamImage',
      tags: [category, subCategory].filter(Boolean),
      preview: '',
      refImages: [],
      createdAt: new Date().toISOString(),
    })
  }

  return items
}

export function normalizePromptImport(content: string, filename: string): PromptItem[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('导入文件不是有效的 JSON')
  }
  const source = detectSource(filename)
  const now = new Date().toISOString()

  return readArray(parsed)
    .map((item, index): PromptItem | null => {
      const title = asString(item.title) || asString(item.name) || asString(item.prompt).slice(0, 40)
      const prompt = asString(item.prompt) || asString(item.content) || asString(item.text)
      if (!title || !prompt) return null
      const sourceId = asString(item.sourceId) || asString(item.id) || stableId(source, `${title}-${prompt}-${index}`)
      const promptZh = asString(item.promptZh) || asString(item.prompt_zh)
      const promptEn = asString(item.promptEn) || asString(item.prompt_en)
      return {
        id: stableId('prompt', `${source}-${sourceId}-${prompt}`),
        title,
        prompt,
        ...(promptZh ? { promptZh } : {}),
        ...(promptEn ? { promptEn } : {}),
        language: promptZh && promptEn ? 'bilingual' : /[\u3400-\u9fff]/.test(prompt) ? 'zh' : 'en',
        source: normalizeSource(source),
        sourceId,
        category: asString(item.category),
        subCategory: asString(item.sub_category),
        author: asString(item.author),
        tags: asStringArray(item.tags),
        preview: asString(item.preview),
        refImages: asStringArray(item.images),
        createdAt: now,
      }
    })
    .filter((item): item is PromptItem => item !== null)
}

export function mergePromptItems(existing: PromptItem[], incoming: PromptItem[]): PromptItem[] {
  const sourceKeys = new Set(existing.map((item) => `${item.source}:${item.sourceId}`))
  const customHashes = new Set(existing.filter((item) => item.source === 'custom').map((item) => hashString(item.prompt)))

  const additions = incoming.filter((item) => {
    const sourceKey = `${item.source}:${item.sourceId}`
    if (sourceKeys.has(sourceKey)) return false
    if (item.source === 'custom') {
      const contentHash = hashString(item.prompt)
      if (customHashes.has(contentHash)) return false
      customHashes.add(contentHash)
    }
    sourceKeys.add(sourceKey)
    return true
  })

  return [...existing, ...additions]
}
