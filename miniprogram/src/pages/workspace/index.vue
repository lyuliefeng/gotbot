<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { modeLabels, stylePresets, toolGroups, type ToolEntry } from '@/domain/catalog'
import { useMiniAppStore } from '@/stores/app'
import type { GenerationInput, GeneratedAsset, GenerationTask } from '@/types'

const store = useMiniAppStore()
const currentTask = ref<GenerationTask | null>(null)
const activeToolId = ref<string>(toolGroups[0]?.tools[0]?.id ?? '')

const activeTool = computed<ToolEntry>(() => store.toolEntries.find((tool) => tool.id === activeToolId.value) ?? store.toolEntries[0])
const isVideoTool = computed(() => activeTool.value.mode === 'txt2video' || activeTool.value.mode === 'img2video')
const availableModels = computed(() => (isVideoTool.value ? store.videoModels : store.imageModels))
const selectedModel = computed(() => (isVideoTool.value ? store.defaultVideoModel : store.defaultImageModel))
const selectedModelId = computed(() => (isVideoTool.value ? store.settings.defaultVideoModelId ?? '' : store.settings.defaultImageModelId))

const form = reactive({
  prompt: '',
  negativePrompt: '低清晰度、变形、文字水印、错误构图',
  style: store.settings.defaultStyle,
  width: store.settings.defaultGenerationSize,
  height: store.settings.defaultGenerationSize,
  batchSize: store.settings.defaultBatchSize,
  steps: 28,
  seed: 128409,
  referenceImage: '',
})

watch(activeTool, (tool) => {
  if (!tool) return
  form.prompt = form.prompt || tool.promptSeed
  form.negativePrompt = tool.negativeSeed || form.negativePrompt
  if (tool.recommendedSize) {
    form.width = tool.recommendedSize.width
    form.height = tool.recommendedSize.height
  }
}, { immediate: true })

const canGenerate = computed(() => Boolean(selectedModel.value && form.prompt.trim()))
const resultAssets = computed<GeneratedAsset[]>(() => currentTask.value?.assets ?? [])

function buildInput(): GenerationInput {
  return {
    mode: activeTool.value.mode,
    prompt: [form.prompt.trim(), activeTool.value.promptSeed, `${form.style} style`].filter(Boolean).join(', '),
    negativePrompt: form.negativePrompt,
    modelId: selectedModel.value?.id ?? '',
    width: Number(form.width),
    height: Number(form.height),
    batchSize: Number(form.batchSize),
    steps: Number(form.steps),
    seed: Number(form.seed),
    style: form.style,
    referenceImage: form.referenceImage || undefined,
    modeOptions: {
      toolId: activeTool.value.id,
      keyMode: selectedModel.value?.keyMode ?? 'platform',
    },
  }
}

async function generate(): Promise<void> {
  currentTask.value = await store.generate(buildInput())
}

function usePrompt(prompt: string): void {
  form.prompt = prompt
}

function selectModel(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  if (isVideoTool.value) store.settings.defaultVideoModelId = value
  else store.settings.defaultImageModelId = value
}
</script>

<template>
  <section class="page">
    <div class="section">
      <h2>创作工作台</h2>
      <p class="muted">{{ activeTool.subtitle }}</p>
      <div class="chip-row">
        <button v-for="tool in store.toolEntries" :key="tool.id" class="chip" :class="{ active: tool.id === activeToolId }" type="button" @click="activeToolId = tool.id">
          {{ tool.title }}
        </button>
      </div>
    </div>

    <div class="section">
      <div class="field">
        <label for="workspace-prompt">提示词</label>
        <textarea id="workspace-prompt" v-model="form.prompt" placeholder="描述主体、风格、光线和场景" />
      </div>
      <div class="chip-row">
        <button v-for="prompt in store.prompts.slice(0, 4)" :key="prompt.id" class="soft-button" type="button" @click="usePrompt(prompt.promptZh || prompt.prompt)">
          {{ prompt.title }}
        </button>
      </div>
    </div>

    <div class="section">
      <h3>参数</h3>
      <div class="grid-fields">
        <label>模型
          <select :value="selectedModelId" @change="selectModel">
            <option v-for="model in availableModels" :key="model.id" :value="model.id">{{ model.name }} · {{ model.keyMode === 'platform' ? '平台 Key' : '用户 Key' }}</option>
          </select>
        </label>
        <label>风格
          <select v-model="form.style">
            <option v-for="style in stylePresets" :key="style" :value="style">{{ style }}</option>
          </select>
        </label>
        <label>宽度
          <input v-model.number="form.width" type="number" min="16" max="4096" />
        </label>
        <label>高度
          <input v-model.number="form.height" type="number" min="16" max="4096" />
        </label>
        <label>数量
          <select v-model.number="form.batchSize">
            <option :value="1">1</option>
            <option :value="2">2</option>
            <option :value="3">3</option>
            <option :value="4">4</option>
          </select>
        </label>
        <label>步数
          <input v-model.number="form.steps" type="number" min="1" max="80" />
        </label>
      </div>
      <div v-if="activeTool.referenceRequired" class="field">
        <label for="reference-image">参考图 Cloud File ID / URL</label>
        <input id="reference-image" v-model="form.referenceImage" placeholder="上传后填入 cloud:// 或 https:// 地址" />
      </div>
      <button class="primary-button" type="button" :disabled="store.loading || !canGenerate" @click="generate">
        {{ store.loading ? '生成中...' : `生成${modeLabels[activeTool.mode]}` }}
      </button>
      <p v-if="store.lastError" class="danger">{{ store.lastError }}</p>
      <p v-if="store.statusMessage" class="muted">{{ store.statusMessage }}</p>
    </div>

    <div v-if="resultAssets.length" class="section">
      <h3>本次结果</h3>
      <div class="asset-grid">
        <article v-for="asset in resultAssets" :key="asset.id" class="asset-card">
          <video v-if="asset.mediaType === 'video' || asset.format === 'mp4'" class="asset-preview" :src="asset.remoteUrl || asset.dataUrl" controls />
          <img v-else-if="asset.dataUrl || asset.remoteUrl" class="asset-preview" :src="asset.dataUrl || asset.remoteUrl" :alt="asset.title" />
          <p>{{ asset.title }}</p>
          <div class="action-row">
            <button class="soft-button" type="button" @click="store.toggleFavorite(asset.taskId, asset.id)">{{ asset.isFavorite ? '取消收藏' : '收藏' }}</button>
            <button class="soft-button" type="button">保存相册</button>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>
