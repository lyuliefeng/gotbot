<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMiniAppStore } from '@/stores/app'

const store = useMiniAppStore()
const keyword = ref('')

const filteredPrompts = computed(() => {
  const value = keyword.value.trim().toLowerCase()
  if (!value) return store.prompts
  return store.prompts.filter((prompt) => `${prompt.title} ${prompt.prompt} ${prompt.promptZh ?? ''} ${prompt.category}`.toLowerCase().includes(value))
})
</script>

<template>
  <section class="page">
    <div class="section">
      <h2>提示词市场</h2>
      <div class="field">
        <label>搜索<input v-model="keyword" placeholder="搜索标题、分类或提示词" /></label>
      </div>
      <div class="action-row">
        <button class="soft-button" type="button" @click="store.syncPrompts('glidea')">同步 Glidea</button>
        <button class="soft-button" type="button" @click="store.syncPrompts('EvoLinkAI')">同步 EvoLinkAI</button>
        <button class="soft-button" type="button" @click="store.syncPrompts('freestylefly')">同步 Freestylefly</button>
      </div>
    </div>

    <article v-for="prompt in filteredPrompts" :key="prompt.id" class="section">
      <h3>{{ prompt.title }}</h3>
      <p>{{ prompt.promptZh || prompt.prompt }}</p>
      <p v-if="prompt.promptEn" class="muted">{{ prompt.promptEn }}</p>
      <div class="action-row">
        <button class="primary-button" type="button" @click="store.setActiveTab('workspace')">使用</button>
        <span class="muted">{{ prompt.source }} · {{ prompt.category || '未分类' }}</span>
      </div>
    </article>
  </section>
</template>
