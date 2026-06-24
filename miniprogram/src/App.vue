<script setup lang="ts">
import { computed } from 'vue'
import { useMiniAppStore } from '@/stores/app'
import WorkspacePage from '@/pages/workspace/index.vue'
import AssetsPage from '@/pages/assets/index.vue'
import ToolsPage from '@/pages/tools/index.vue'
import SettingsPage from '@/pages/settings/index.vue'
import PromptsPage from '@/pages/prompts/index.vue'
import AboutPage from '@/pages/about/index.vue'

const store = useMiniAppStore()

const activeView = computed(() => store.activeTab)
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">微信小程序首版</p>
        <h1>道听徒说</h1>
      </div>
      <button class="ghost-button" type="button" @click="store.refreshAll()">刷新</button>
    </header>

    <main class="page-stack">
      <WorkspacePage v-if="activeView === 'workspace'" />
      <AssetsPage v-else-if="activeView === 'assets'" />
      <ToolsPage v-else-if="activeView === 'tools'" />
      <SettingsPage v-else-if="activeView === 'settings'" />
      <PromptsPage v-else-if="activeView === 'prompts'" />
      <AboutPage v-else />
    </main>

    <nav class="tabbar">
      <button v-for="tab in store.tabs" :key="tab.id" class="tabbar-item" :class="{ active: tab.id === activeView }" type="button" @click="store.setActiveTab(tab.id)">
        <span>{{ tab.label }}</span>
      </button>
    </nav>
  </div>
</template>
