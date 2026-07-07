import { vi } from 'vitest'
import { config } from '@vue/test-utils'
import i18n from './i18n'

config.global.plugins.push(i18n)

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = {
    get length() {
      return storage.size
    },
    clear: vi.fn(() => storage.clear()),
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(storage.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      storage.delete(key)
    }),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value)
    }),
  }
}
