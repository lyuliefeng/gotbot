<script setup lang="ts">
import { computed, ref } from 'vue'
import { modeLabels } from '@/domain/catalog'
import { useMiniAppStore } from '@/stores/app'

const store = useMiniAppStore()
const onlyFavorite = ref(false)

const visibleTasks = computed(() => {
  const tasks = store.tasks.slice().sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  if (!onlyFavorite.value) return tasks
  return tasks
    .map((task) => ({ ...task, assets: task.assets.filter((asset) => asset.isFavorite) }))
    .filter((task) => task.assets.length)
})
</script>

<template>
  <section class="page">
    <div class="section">
      <h2>资产库</h2>
      <div class="stat-row">
        <div class="stat-card">
          <strong>{{ store.tasks.length }}</strong>
          <p class="muted">任务</p>
        </div>
        <div class="stat-card">
          <strong>{{ store.completedTasks.length }}</strong>
          <p class="muted">完成</p>
        </div>
        <div class="stat-card">
          <strong>{{ store.favoriteAssets.length }}</strong>
          <p class="muted">收藏</p>
        </div>
      </div>
      <button class="chip" :class="{ active: onlyFavorite }" type="button" @click="onlyFavorite = !onlyFavorite">只看收藏</button>
    </div>

    <article v-for="task in visibleTasks" :key="task.id" class="section">
      <h3>{{ modeLabels[task.mode] }} · {{ task.status }}</h3>
      <p class="muted">{{ task.prompt }}</p>
      <div class="asset-grid">
        <div v-for="asset in task.assets" :key="asset.id" class="asset-card">
          <img v-if="asset.dataUrl || asset.remoteUrl" class="asset-preview" :src="asset.dataUrl || asset.remoteUrl" :alt="asset.title" />
          <p>{{ asset.title }}</p>
          <p class="muted">{{ asset.width }} x {{ asset.height }} · {{ asset.format }}</p>
          <div class="action-row">
            <button class="soft-button" type="button" @click="store.toggleFavorite(task.id, asset.id)">{{ asset.isFavorite ? '取消收藏' : '收藏' }}</button>
          </div>
        </div>
      </div>
      <button class="ghost-button" type="button" @click="store.deleteTask(task.id)">删除任务</button>
    </article>

    <div v-if="!visibleTasks.length" class="section">
      <p class="muted">还没有生成资产。去创作页生成第一批图片吧。</p>
    </div>
  </section>
</template>
