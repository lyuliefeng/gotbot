<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Globe } from 'lucide-vue-next'
import { useLocale, type LocaleCode } from '@/composables/useLocale'

const { t } = useI18n()
const { currentLocale, locales, setLocale } = useLocale()
const open = ref(false)

function select(code: LocaleCode): void {
  setLocale(code)
  open.value = false
}
</script>

<template>
  <div class="locale-switcher" @mouseenter="open = true" @mouseleave="open = false">
    <button class="locale-toggle-btn" type="button" :aria-label="t('common.language')">
      <Globe :size="18" />
    </button>
    <Transition name="dropdown">
      <div v-if="open" class="locale-dropdown">
        <div class="locale-dropdown-section">
          <span class="locale-dropdown-label">{{ t('common.language') }}</span>
          <div class="locale-options">
            <button
              v-for="item in locales"
              :key="item.code"
              class="locale-option"
              :class="{ active: currentLocale === item.code }"
              type="button"
              @click="select(item.code)"
            >
              <span>{{ item.label }}</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.locale-switcher {
  position: relative;
}

.locale-toggle-btn {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  color: var(--muted);
  border: 1px solid var(--border);
  background: var(--tint);
  transition: color 160ms, border-color 160ms, background 160ms;
}

.locale-toggle-btn:hover {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-soft);
}

.locale-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 60;
  width: 160px;
  padding: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--elev-raised);
  backdrop-filter: blur(20px);
}

.locale-dropdown-section {
  display: grid;
  gap: 6px;
}

.locale-dropdown-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--muted);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 4px 6px 2px;
}

.locale-options {
  display: grid;
  gap: 2px;
}

.locale-option {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 5px 8px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--fg-2);
  transition: background 120ms, color 120ms;
}

.locale-option:hover {
  background: var(--tint);
  color: var(--fg);
}

.locale-option.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 700;
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 160ms, transform 160ms;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
