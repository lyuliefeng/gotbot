import { ref, watch } from 'vue'
import i18n, { SUPPORTED_LOCALES, type LocaleCode } from '@/i18n'

export type { LocaleCode } from '@/i18n'

const LOCALE_STORAGE_KEY = 'gotbot.locale'

const currentLocale = ref<LocaleCode>(i18n.global.locale.value as LocaleCode)

let initialized = false

function loadPersisted(): void {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (raw === 'zh-CN' || raw === 'en-US') {
      currentLocale.value = raw
    }
  } catch {
    /* ignore corrupt storage */
  }
}

function persist(): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, currentLocale.value)
  } catch {
    /* ignore */
  }
}

function applyToI18n(): void {
  i18n.global.locale.value = currentLocale.value
}

function init(): void {
  if (initialized) return
  initialized = true
  loadPersisted()
  applyToI18n()
  watch(currentLocale, () => {
    applyToI18n()
    persist()
  })
}

function setLocale(code: LocaleCode): void {
  currentLocale.value = code
}

export function useLocale() {
  init()
  return {
    currentLocale,
    locales: SUPPORTED_LOCALES,
    setLocale,
  }
}
