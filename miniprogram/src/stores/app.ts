import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { builtinPrompts, defaultCoverPresets, defaultModels, modeLabels, stylePresets, toolGroups } from '@/domain/catalog'
import { createLocalPreviewTask, validateGenerationInput } from '@/domain/generation'
import { mergePromptItems, normalizePromptImport } from '@/domain/promptImport'
import { callCloud } from '@/services/cloud'
import type { ActiveTab, AppSettings, GenerationInput, GenerationTask, ModelProfile, PromptItem } from '@/types'
import { createId } from '@/domain/ids'

const defaultSettings: AppSettings = {
  defaultExportFormat: 'png',
  defaultImageModelId: defaultModels[0]?.id ?? '',
  defaultVideoModelId: defaultModels.find((model) => model.kind === 'video')?.id ?? '',
  defaultGenerationSize: 1024,
  defaultBatchSize: 1,
  defaultStyle: stylePresets[0],
  autoSaveHistory: true,
  includePromptMetadata: true,
}

const builtinDefaultModelIds = new Set([
  'platform-agnes-image',
  'platform-gogoing-text',
  'platform-gogoing-image',
  'platform-agnes-video',
  'openai-gpt-image-2',
])

function filterUserModels(modelList: ModelProfile[]): ModelProfile[] {
  return modelList.filter((model) => model.keyMode !== 'platform' && !builtinDefaultModelIds.has(model.id))
}

export const useMiniAppStore = defineStore('mini-app', () => {
  const activeTab = ref<ActiveTab>('workspace')
  const models = ref<ModelProfile[]>(filterUserModels([...defaultModels]))
  const prompts = ref<PromptItem[]>([...builtinPrompts])
  const tasks = ref<GenerationTask[]>([])
  const coverPresets = ref([...defaultCoverPresets])
  const settings = ref<AppSettings>({ ...defaultSettings })
  const loading = ref(false)
  const lastError = ref('')
  const statusMessage = ref('')
  const openid = ref('')

  const tabs = [
    { id: 'workspace', label: '创作' },
    { id: 'assets', label: '资产' },
    { id: 'tools', label: '工具' },
    { id: 'settings', label: '设置' },
    { id: 'prompts', label: '提示词' },
    { id: 'about', label: '关于' },
  ] as const

  const imageModels = computed(() => models.value.filter((model) => model.kind === 'image'))
  const videoModels = computed(() => models.value.filter((model) => model.kind === 'video'))
  const defaultImageModel = computed(() => imageModels.value.find((model) => model.id === settings.value.defaultImageModelId) ?? imageModels.value[0])
  const defaultVideoModel = computed(() => videoModels.value.find((model) => model.id === settings.value.defaultVideoModelId) ?? videoModels.value[0])
  const completedTasks = computed(() => tasks.value.filter((task) => task.status === 'completed'))
  const favoriteAssets = computed(() => tasks.value.flatMap((task) => task.assets.filter((asset) => asset.isFavorite)))
  const toolEntries = computed(() => toolGroups.flatMap((group) => group.tools))

  function setActiveTab(tab: ActiveTab): void {
    activeTab.value = tab
  }

  function notify(message: string): void {
    statusMessage.value = message
    lastError.value = ''
  }

  function fail(message: string): void {
    lastError.value = message
  }

  async function bootstrap(): Promise<void> {
    loading.value = true
    try {
      const loginResult = await callCloud<{ openid: string }>('login', { action: 'bootstrap' }).catch(() => ({ openid: '' }))
      openid.value = loginResult.openid
      const remoteModels = await callCloud<ModelProfile[]>('modelProfiles', { action: 'list' }).catch(() => [])
      if (remoteModels.length) {
        const userModels = filterUserModels(remoteModels)
        models.value = userModels
        settings.value.defaultImageModelId = userModels.find((model) => model.kind === 'image' && model.isPrimary)?.id ?? userModels.find((model) => model.kind === 'image')?.id ?? ''
        settings.value.defaultVideoModelId = userModels.find((model) => model.kind === 'video' && model.isPrimary)?.id ?? userModels.find((model) => model.kind === 'video')?.id ?? ''
      }
      const remoteTasks = await callCloud<GenerationTask[]>('generationTasks', { action: 'list' }).catch(() => [])
      if (remoteTasks.length) tasks.value = remoteTasks
      const remotePrompts = await callCloud<PromptItem[]>('promptPacks', { action: 'list' }).catch(() => [])
      if (remotePrompts.length) prompts.value = mergePromptItems([...builtinPrompts], remotePrompts)
    } catch (error) {
      fail(error instanceof Error ? error.message : '初始化失败')
    } finally {
      loading.value = false
    }
  }

  async function refreshAll(): Promise<void> {
    await bootstrap()
  }

  async function saveModel(profile: ModelProfile): Promise<void> {
    const next = { ...profile, id: profile.id || createId('model') }
    const saved = await callCloud<ModelProfile>('modelProfiles', { action: 'save', payload: { profile: next } }).catch(() => next)
    const index = models.value.findIndex((item) => item.id === saved.id)
    if (index >= 0) models.value[index] = saved
    else models.value.push(saved)
    notify('模型配置已保存')
  }

  async function deleteModel(id: string): Promise<void> {
    await callCloud<boolean>('modelProfiles', { action: 'delete', payload: { id } }).catch(() => true)
    models.value = models.value.filter((model) => model.id !== id)
    notify('模型配置已删除')
  }

  async function testModel(profile: ModelProfile): Promise<string> {
    const result = await callCloud<{ ok: boolean; message: string }>('modelProfiles', { action: 'test', payload: { profile } })
      .catch(() => ({ ok: true, message: '当前为本地开发环境，未执行真实云端探测' }))
    notify(result.message)
    return result.message
  }

  async function generate(input: GenerationInput): Promise<GenerationTask> {
    validateGenerationInput(input)
    loading.value = true
    try {
      const task = await callCloud<GenerationTask>('generationTasks', { action: 'create', payload: { input } })
        .catch(() => createLocalPreviewTask(input))
      tasks.value = [task, ...tasks.value.filter((item) => item.id !== task.id)]
      notify(`已生成 ${task.assets.length} 个${modeLabels[task.mode]}结果`)
      return task
    } catch (error) {
      const message = error instanceof Error ? error.message : '生成失败'
      fail(message)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function deleteTask(id: string): Promise<void> {
    await callCloud<boolean>('generationTasks', { action: 'deleteTask', payload: { id } }).catch(() => true)
    tasks.value = tasks.value.filter((task) => task.id !== id)
    notify('任务已删除')
  }

  async function toggleFavorite(taskId: string, assetId: string): Promise<void> {
    await callCloud<boolean>('generationTasks', { action: 'toggleFavoriteAsset', payload: { taskId, assetId } }).catch(() => true)
    tasks.value = tasks.value.map((task) => {
      if (task.id !== taskId) return task
      return {
        ...task,
        assets: task.assets.map((asset) => asset.id === assetId ? { ...asset, isFavorite: !asset.isFavorite } : asset),
      }
    })
  }

  async function syncPrompts(source: 'glidea' | 'EvoLinkAI' | 'freestylefly'): Promise<void> {
    const synced = await callCloud<PromptItem[]>('promptPacks', { action: 'sync', payload: { source } }).catch(() => [])
    if (synced.length) {
      prompts.value = mergePromptItems(prompts.value, synced)
      notify(`已同步 ${synced.length} 条提示词`)
      return
    }
    notify('当前环境未返回云端提示词，保留本地内置数据')
  }

  function importPromptBatch(files: Array<{ content: string; filename: string }>): number {
    const imported = files.flatMap((file) => normalizePromptImport(file.content, file.filename))
    const before = prompts.value.length
    prompts.value = mergePromptItems(prompts.value, imported)
    const added = prompts.value.length - before
    notify(added ? `已导入 ${added} 条提示词` : '没有新增提示词')
    return added
  }

  bootstrap().catch(() => undefined)

  return {
    activeTab,
    tabs,
    models,
    prompts,
    tasks,
    coverPresets,
    settings,
    loading,
    lastError,
    statusMessage,
    openid,
    imageModels,
    videoModels,
    defaultImageModel,
    defaultVideoModel,
    completedTasks,
    favoriteAssets,
    toolEntries,
    setActiveTab,
    refreshAll,
    saveModel,
    deleteModel,
    testModel,
    generate,
    deleteTask,
    toggleFavorite,
    syncPrompts,
    importPromptBatch,
  }
})
