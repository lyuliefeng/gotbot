import type { CloudResult } from '@/types'

type CloudFunctionName = 'login' | 'modelProfiles' | 'generationTasks' | 'promptPacks'

interface InvokeOptions {
  action: string
  payload?: Record<string, unknown>
}

declare global {
  interface Window {
    wx?: {
      cloud?: {
        callFunction<T>(options: { name: string; data?: Record<string, unknown> }): Promise<{ result: CloudResult<T> }>
      }
    }
  }
}

export async function callCloud<T>(name: CloudFunctionName, options: InvokeOptions): Promise<T> {
  const caller = window.wx?.cloud?.callFunction
  if (!caller) {
    throw new Error('当前环境未注入微信云开发 SDK，请在微信开发者工具中运行或接入真实 SDK')
  }

  const { result } = await caller<T>({
    name,
    data: {
      action: options.action,
      ...(options.payload ?? {}),
    },
  })

  if (!result.ok) {
    throw new Error(result.error || '云函数调用失败')
  }

  if (result.data === undefined) {
    throw new Error('云函数未返回数据')
  }

  return result.data
}
