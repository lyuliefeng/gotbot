<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import { useAppStore } from '@/stores/app'
import { useTheme } from '@/composables/useTheme'

const store = useAppStore()
const route = useRoute()
const useShell = computed(() => route.meta.shell !== false)
useTheme()

onMounted(() => {
  void store.loadPersistedTasks()
})
</script>

<template>
  <AppShell v-if="useShell">
    <RouterView />
  </AppShell>
  <RouterView v-else />

  <Transition name="toast">
    <div v-if="store.toast" class="toast" :class="store.toast.type" role="status" aria-live="polite">
      <span class="status-dot" :class="{ error: store.toast.type === 'error', warn: store.toast.type === 'info' }" />
      {{ store.toast.message }}
    </div>
  </Transition>
</template>
