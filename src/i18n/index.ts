import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN'
import enUS from './locales/en-US'

export const SUPPORTED_LOCALES = [
  { code: 'zh-CN', label: '中文' },
  { code: 'en-US', label: 'English' },
] as const

export type LocaleCode = (typeof SUPPORTED_LOCALES)[number]['code']

const LOCALE_STORAGE_KEY = 'gotbot.locale'

function detectInitialLocale(): LocaleCode {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LOCALE_STORAGE_KEY) : null
    if (raw === 'zh-CN' || raw === 'en-US') return raw
  } catch {
    /* ignore */
  }
  return 'zh-CN'
}

const i18n = createI18n({
  legacy: false,
  locale: detectInitialLocale(),
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
})

export default i18n
