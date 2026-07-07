<script setup lang="ts">
import {
  CircleHelp,
  ClipboardList,
  Home,
  Images,
  Layers3,
  Settings,
  Wrench,
} from 'lucide-vue-next'
import ThemeSwitcher from '@/components/ThemeSwitcher.vue'
import LocaleSwitcher from '@/components/LocaleSwitcher.vue'
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const store = useAppStore()

const navItems = [
  { to: '/', key: 'home', icon: Home },
  { to: '/workspace', key: 'workspace', icon: Layers3 },
  { to: '/tools', key: 'tools', icon: Wrench },
  { to: '/history', key: 'history', icon: Images, badge: computed(() => store.historyAssetCount) },
  { to: '/operations', key: 'operations', icon: ClipboardList, badge: computed(() => store.tasks.filter((task) => task.status === 'failed').length) },
  { to: '/settings', key: 'settings', icon: Settings },
  { to: '/about', key: 'about', icon: CircleHelp },
]

const navTitleMap: Record<string, string> = {
  home: 'nav.home',
  workspace: 'nav.workspace',
  tools: 'nav.tools',
  history: 'nav.history',
  operations: 'nav.operations',
  settings: 'nav.settings',
  about: 'nav.about',
  login: 'nav.home',
}
const pageTitle = computed(() => t(navTitleMap[route.name as string] ?? 'nav.home'))

const imageStatus = computed(() => store.primaryImageModel?.status ?? 'untested')
const textStatus = computed(() => store.textModels.some((model) => model.status === 'connected') ? 'connected' : 'untested')

function handleGlobalShortcut(event: KeyboardEvent): void {
  if (!event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return
  const index = Number(event.key) - 1
  const item = Number.isInteger(index) ? navItems[index] : undefined
  if (!item) return
  event.preventDefault()
  void router.push(item.to)
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalShortcut)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalShortcut)
})
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar" aria-label="主导航">
      <RouterLink class="brand" to="/">
        <span class="brand-mark">L</span>
        <span class="brand-name">
          <strong>{{ t('nav.brand') }}</strong>
          <span>{{ t('nav.brandSub') }}</span>
        </span>
      </RouterLink>

      <div class="sidebar-section">
        <div class="sidebar-label">{{ t('nav.section') }}</div>
        <nav class="sidebar-nav">
          <RouterLink
            v-for="item in navItems"
            :key="item.to"
            class="nav-link"
            :class="{ active: route.path === item.to }"
            :to="item.to"
          >
            <component :is="item.icon" :size="16" />
            {{ t('nav.' + item.key) }}
            <span v-if="item.badge?.value" class="badge">{{ item.badge.value }}</span>
          </RouterLink>
        </nav>
      </div>

      <div class="sidebar-footer">
        <div class="model-status">
          <div class="model-status-row">
            <strong>图像模型</strong>
            <span class="status-pill">
              <span class="status-dot" :class="{ warn: imageStatus !== 'connected' }" />
              {{ imageStatus === 'connected' ? t('common.connected') : t('nav.modelPending') }}
            </span>
          </div>
          <div class="model-status-row">
            <strong>文本模型</strong>
            <span class="status-pill">
              <span class="status-dot" :class="{ warn: textStatus !== 'connected' }" />
              {{ textStatus === 'connected' ? t('common.connected') : t('nav.modelNotSet') }}
            </span>
          </div>
        </div>
      </div>
    </aside>

    <main class="app-main">
      <div class="app-topbar">
        <div class="breadcrumb">
          <Images :size="16" />
          <strong>{{ t('nav.brand') }}</strong>
          <span>/</span>
          <span>{{ pageTitle }}</span>
        </div>
        <div class="topbar-actions">
          <LocaleSwitcher />
          <ThemeSwitcher />
        </div>
      </div>

      <Transition name="page" mode="out-in">
        <slot />
      </Transition>
    </main>
  </div>
</template>
