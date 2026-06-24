<script setup lang="ts">
import { toolGroups } from '@/domain/catalog'
import { useMiniAppStore } from '@/stores/app'

const store = useMiniAppStore()
</script>

<template>
  <section class="page">
    <div class="section">
      <h2>工具库</h2>
      <p class="muted">首版保留图像主链路工具，视频工具在二期进入任务系统。</p>
    </div>

    <div v-for="group in toolGroups" :key="group.id" class="section">
      <h3>{{ group.name }}</h3>
      <div class="tool-grid">
        <article v-for="tool in group.tools" :key="tool.id" class="tool-card">
          <h3>{{ tool.title }}</h3>
          <p>{{ tool.desc }}</p>
          <p class="muted">{{ tool.subtitle }}</p>
          <button class="soft-button" type="button" @click="store.setActiveTab('workspace')">去创作</button>
        </article>
      </div>
    </div>
  </section>
</template>
