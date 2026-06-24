declare global {
  interface Window {
    electronAPI?: {
      invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>
      pickDirectory(defaultPath?: string): Promise<string | null>
    }
    samimageE2eDirectory?: string
  }
}

export function isElectronRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electronAPI)
}

export async function invokeOptional<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isElectronRuntime()) return null
  return await window.electronAPI!.invoke<T>(command, args)
}

export async function pickDirectory(defaultPath?: string): Promise<string | null> {
  const browserFallback = typeof window !== 'undefined' ? window.samimageE2eDirectory : undefined
  if (!isElectronRuntime()) return browserFallback ?? null

  try {
    return await window.electronAPI!.pickDirectory(defaultPath?.trim() || undefined)
  } catch (error) {
    console.warn('Electron directory picker failed', error)
    return null
  }
}
