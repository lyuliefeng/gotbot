import type { GenerationInput, GenerationTask, ModelProfile } from '@/types/domain'

interface WebGenerationPayload {
  input: GenerationInput
  model: ModelProfile
}

function isProxyUnavailable(status: number): boolean {
  return status === 404 || status === 405
}

function errorMessageText(error: unknown): string {
  if (typeof error === 'object' && error !== null && typeof (error as Record<string, unknown>).message === 'string') {
    return String((error as Record<string, unknown>).message)
  }
  return error instanceof Error ? error.message : String(error)
}

function errorCause(error: unknown): unknown {
  return error instanceof Error && 'cause' in error ? (error as Error & { cause?: unknown }).cause : undefined
}

function errorField(error: unknown, key: string): string {
  if (typeof error !== 'object' || error === null) return ''
  const value = (error as Record<string, unknown>)[key]
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function proxyNetworkError(error: unknown): Error {
  const cause = errorCause(error)
  const message = errorMessageText(error)
  const causeCode = errorField(cause, 'code') || errorField(cause, 'name')
  const causeMessage = cause ? errorMessageText(cause) : ''
  const detail = causeCode && causeMessage
    ? `${causeCode}: ${causeMessage}`
    : causeMessage || causeCode
  const suffix = detail && detail !== message ? `（${detail}）` : ''
  return new Error(`Web 生成代理不可用: ${message}${suffix}`, { cause: error })
}

async function readGenerationError(response: Response): Promise<string> {
  try {
    const payload = await response.json()
    if (payload && typeof payload === 'object') {
      const record = payload as Record<string, unknown>
      if (typeof record.error === 'string' && record.error.trim()) return record.error
      if (typeof record.message === 'string' && record.message.trim()) return record.message
    }
  } catch {
    // Fall through to generic status message.
  }
  return `Web 生成代理请求失败: HTTP ${response.status}`
}

const CLIENT_MAX_RETRIES = 2
const CLIENT_RETRY_BASE_MS = 1000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function createWebGenerationTask(input: GenerationInput, model: ModelProfile): Promise<GenerationTask | null> {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return null

  let response: Response | null = null
  const payload: WebGenerationPayload = { input, model }
  let lastError: unknown = null

  for (let attempt = 0; attempt <= CLIENT_MAX_RETRIES; attempt++) {
    try {
      response = await fetch('/api/generation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      break
    } catch (error) {
      lastError = error
      if (attempt < CLIENT_MAX_RETRIES) {
        await sleep(CLIENT_RETRY_BASE_MS * Math.pow(2, attempt))
        continue
      }
    }
  }

  if (!response) throw proxyNetworkError(lastError)

  if (isProxyUnavailable(response.status)) return null
  if (!response.ok) throw new Error(await readGenerationError(response))

  try {
    return await response.json() as GenerationTask
  } catch (error) {
    throw new Error(`解析 Web 生成结果失败: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
}
