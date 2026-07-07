<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
  icon?: Component
  title?: string
  description?: string
  compact?: boolean
}>()
</script>

<template>
  <div class="empty-state" :class="{ 'empty-state-compact': compact }">
    <span v-if="icon" class="empty-state-icon"><component :is="icon" :size="compact ? 18 : 22" /></span>
    <strong v-if="title" class="empty-state-title">{{ title }}</strong>
    <p v-if="description" class="empty-state-desc">{{ description }}</p>
    <div v-if="$slots.action" class="empty-state-action">
      <slot name="action" />
    </div>
  </div>
</template>

<style scoped>
.empty-state {
  display: grid;
  place-items: center;
  align-content: center;
  gap: var(--space-3);
  padding: var(--space-8) var(--space-6);
  text-align: center;
  color: var(--muted);
  background: var(--card-bg);
  border: 1px dashed var(--border-glow);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-1);
  backdrop-filter: blur(18px) saturate(135%);
}

.empty-state-compact {
  gap: var(--space-2);
  padding: var(--space-5) var(--space-4);
  min-height: 0;
}

.empty-state-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: var(--radius-pill);
  background: var(--accent-soft);
  color: var(--accent);
  box-shadow: var(--btn-primary-shadow);
}

.empty-state-compact .empty-state-icon {
  width: 38px;
  height: 38px;
}

.empty-state-title {
  color: var(--fg);
  font-size: 15px;
  font-weight: 700;
}

.empty-state-desc {
  margin: 0;
  max-width: 46ch;
  line-height: 1.7;
  font-size: 13px;
}

.empty-state-action {
  margin-top: var(--space-1);
}
</style>
