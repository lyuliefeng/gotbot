import type { GenerationInput, GenerationTask, ModelProfile } from '@/types/domain'

interface WebGenerationPayload {
  input: GenerationInput
  model: ModelProfile
}

function isProxyUnavailable(status: number): boolean {
  return status === 404 || status === 405
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

export async function createWebGenerationTask(input: GenerationInput, model: ModelProfile): Promise<GenerationTask | null> {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return null

  let response: Response
  const payload: WebGenerationPayload = { input, model }
  try {
    response = await fetch('/api/generation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    throw new Error(`Web 生成代理不可用: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }

  if (isProxyUnavailable(response.status)) return null
  if (!response.ok) throw new Error(await readGenerationError(response))

  try {
    return await response.json() as GenerationTask
  } catch (error) {
    throw new Error(`解析 Web 生成结果失败: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
}
