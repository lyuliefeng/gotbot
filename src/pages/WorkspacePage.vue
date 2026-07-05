<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  Bot,
  Box,
  Copy,
  Download,
  FolderOpen,
  Grid2x2,
  Images,
  Library,
  MonitorSmartphone,
  PanelsTopLeft,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  Upload,
  WandSparkles,
} from 'lucide-vue-next'
import { aspectPresets, defaultIconProjectName, defaultToolForMode, findToolEntry, getAvailableIcoExportSizes, getExportFormatOptions, iconExportFormatOptions, iconSizePresets, modeLabels, stylePresets, threeDStylePresets, toolGroups } from '@/data/catalog'
import type { IconExportKind } from '@/data/catalog'
import { useAppStore } from '@/stores/app'
import { containsChineseText } from '@/domain/language'
import { pickDirectory } from '@/services/desktop'
import { synthesizeGifDataUrl } from '@/domain/gif'
import { applyPostProcessPipeline } from '@/domain/postprocess'
import { resolveToolEffects, type ModeState } from '@/domain/tools'
import { resolveToolIcon } from '@/domain/icons'
import type { ThreeDStylePreset, ToolEntry } from '@/data/catalog'
import type { ExportFormat, GeneratedAsset, GenerationMode, GenerationTask, PromptItem } from '@/types/domain'

const route = useRoute()
const store = useAppStore()

const mode = ref<GenerationMode>('txt2img')
const activeToolId = ref('')
const prompt = ref('')
const negativePrompt = ref('低清晰度、变形、文字水印、错误构图')
const style = ref(store.settings.defaultStyle)
const width = ref(store.settings.defaultGenerationSize)
const height = ref(store.settings.defaultGenerationSize)
const batchSize = ref(store.settings.defaultBatchSize)
const steps = ref(28)
const seed = ref(128409)
const creativity = ref(64)
const detailLevel = ref(72)
const poseAdjustment = ref(35)
const lineControl = ref('natural')
const imageStrength = ref(55)
const resizeMode = ref('just-resize')
const iconBackground = ref('transparent')
const depthStrength = ref(78)
const gifDuration = ref(4)
const videoFrameMode = ref<'duration' | 'eight-n-plus-one'>('duration')
const videoDuration = ref(3)
const videoFrameRate = ref(24)
const videoFrameN = ref(10)
const actionGuidance = ref('')
const facialExpression = ref('natural')
const selectedModelId = ref('')
const referenceImage = ref('')
const currentTask = ref<GenerationTask | null>(null)
const selectedAsset = ref<GeneratedAsset | null>(null)
const generating = ref(false)
const generateCooldown = ref(false)
const promptModalOpen = ref(false)
const toolPickerOpen = ref(false)
const activeToolGroupId = ref(toolGroups[0]?.id ?? '')
const libraryOpen = ref(false)
const exportOpen = ref(false)
const threeDPreviewOpen = ref<ThreeDStylePreset | null>(null)
const promptSearch = ref('')
const promptCategory = ref('全部')
const promptPage = ref(1)
const promptPageSize = 12
const exportFormat = ref<ExportFormat>(store.settings.defaultExportFormat)
const iconExportKind = ref<IconExportKind>('ico')
const exportScale = ref(1)
const selectedIcoExportSizes = ref<number[]>([])
const isIconExport = computed(() => (actionTask.value?.mode ?? mode.value) === 'icon')
const iconProjectName = ref(defaultIconProjectName())
const iconExportButtonLabel = computed(() => {
  if (!isIconExport.value) return '导出图片'
  return iconExportKind.value === 'png' ? '导出 PNG' : '导出 ICO'
})
const extraOptions = reactive<Record<string, string | number>>({})
const retryNotice = ref('')
const generationError = ref('')
const translatingPrompt = ref(false)
const polishingNegativePrompt = ref(false)
const referenceInput = ref<HTMLInputElement | null>(null)
const resizeModeOptions = ['just-resize', 'crop-resize', 'resize-fill'] as const
const iconBackgroundOptions = ['transparent', 'rounded', 'solid'] as const
const generateDebounceMs = 900
let generateCooldownTimer: number | undefined
type RouteModeOptions = Record<string, string | number | boolean>
type SizePreset = {
  id: string
  name: string
  width: number
  height: number
  hint?: string
}

const currentModeLabel = computed(() => modeLabels[mode.value])
const activeTool = computed<ToolEntry | undefined>(() => findToolEntry(activeToolId.value))
const activeToolGroup = computed(() => toolGroups.find((group) => group.id === activeToolGroupId.value) ?? toolGroups[0])
const activeToolGroupTools = computed(() => activeToolGroup.value?.tools ?? [])
const currentToolGroup = computed(() => toolGroups.find((group) => group.tools.some((tool) => tool.id === activeToolId.value)))
const workspaceTitle = computed(() => activeTool.value?.title ?? `${currentModeLabel.value}工作台`)
const workspaceSubtitle = computed(() => activeTool.value?.subtitle ?? modeDescriptionFallback.value)
const activeToolControls = computed(() => activeTool.value?.extraControls ?? [])
const activeToolTips = computed(() => activeTool.value?.tips ?? [])
// 参考图是否必填：图生视频必须上传；文生视频保持纯提示词流程
// 工具名带「去/换/修」的对象类工具需要参考图；「转换/增强/卡通化」类工具可纯提示词创作
const referenceRequired = computed(() => mode.value === 'img2video' || Boolean(activeTool.value?.referenceRequired))
const showReferenceBlock = computed(() => mode.value !== 'txt2video')
const recommendedSizeLabel = computed(() => {
  const tool = activeTool.value
  if (!tool?.recommendedSize) return tool?.recommendedAspect ?? ''
  const { width: w, height: h } = tool.recommendedSize
  return tool.recommendedAspect ? `${w} x ${h} · ${tool.recommendedAspect}` : `${w} x ${h}`
})
const modeDescriptionFallback = computed(() => {
  const map: Record<GenerationMode, string> = {
    txt2img: '输入提示词，AI 生成图像',
    img2img: '上传图片，风格转换与重绘',
    cover: '自媒体封面一键生成',
    icon: 'App 图标、3D 图标、品牌标识',
    '3d': '生成带深度感的产品与概念图',
    gif: '生成或转换短循环动图',
    txt2video: '输入提示词，AI 生成视频',
    img2video: '上传图片，AI 生成动态视频',
  }
  return map[mode.value]
})
const modeFlowCopy = computed(() => {
  if (activeTool.value?.flowCopy) return activeTool.value.flowCopy
  const flowCopy: Record<GenerationMode, string> = {
    txt2img: '文生图读取正向/反向提示词与风格预设，结合模型、尺寸和批量参数生成多张结果。',
    img2img: '图生图读取参考图、正向提示词与图片强度，保留主体结构并输出新的风格变体。',
    cover: '封面图读取平台尺寸、标题提示词与风格预设，生成适配自媒体平台的封面。',
    icon: 'ICON 读取品牌描述、输出尺寸和背景策略，生成适合应用或网站的图标。',
    '3d': '3D 图读取产品描述、立体感和材质提示，生成具备空间深度的概念图。',
    gif: 'GIF 动图读取提示词、时长和循环动作描述，生成短循环动画结果。',
    txt2video: '文生视频读取提示词、尺寸、帧率和帧数，创建 Agnes 异步视频任务并轮询 MP4。',
    img2video: '图生视频会临时上传参考图，读取提示词和视频参数，创建 Agnes 异步视频任务。',
  }
  return flowCopy[mode.value]
})
const isVideoMode = computed(() => mode.value === 'txt2video' || mode.value === 'img2video')
const availableGenerationModels = computed(() => (isVideoMode.value ? store.videoModels : store.imageModels))
const defaultModel = computed(() => (isVideoMode.value ? store.primaryVideoModel : store.defaultImageModel))
const selectedModel = computed(() => availableGenerationModels.value.find((model) => model.id === selectedModelId.value) ?? defaultModel.value)
const textAutoRouteSummary = computed(() => {
  const routes = store.textAutoRouteProfiles
  if (!routes.length) return '未配置文本模型'
  const primary = routes[0]
  const routeCount = routes.length > 1 ? ` · auto ${routes.length} 路` : ' · auto'
  return `${primary.model || primary.name}${routeCount}`
})
type PromptCategoryOption = {
  value: string
  label: string
  icon: unknown
}

const eightNFramePresets = [
  { label: '快速预览', n: 10, frames: 81, seconds: '约 3.4s' },
  { label: '标准效果', n: 15, frames: 121, seconds: '约 5s' },
  { label: '连贯动作', n: 30, frames: 241, seconds: '约 10s' },
  { label: '长镜头', n: 45, frames: 361, seconds: '约 15s' },
] as const

function resolvePromptCategoryMeta(category: string): Omit<PromptCategoryOption, 'value'> {
  const map: Record<string, Omit<PromptCategoryOption, 'value'>> = {
    全部: { label: '全部', icon: Grid2x2 },
    封面: { label: '封面', icon: PanelsTopLeft },
    图生图: { label: '图生图', icon: Images },
    ICON: { label: '图标', icon: MonitorSmartphone },
    '3D': { label: '3D', icon: Box },
    GIF: { label: '动图', icon: Sparkles },
    文生图: { label: '文生图', icon: WandSparkles },
    'Use GPT Image2 API': { label: 'GPT 图像 API', icon: Bot },
    'Use GPT Image 2 API': { label: 'GPT 图像 API', icon: Bot },
    'E-commerceCaes': { label: '电商案例', icon: ShoppingBag },
    'E-commerceCases': { label: '电商案例', icon: ShoppingBag },
  }
  return map[category] ?? { label: category || '未分类', icon: Library }
}

const promptCategoryOptions = computed<PromptCategoryOption[]>(() =>
  ['全部', ...Array.from(new Set(store.prompts.flatMap((item) => [item.category, item.subCategory]).filter(Boolean)))].map((value) => ({
    value,
    ...resolvePromptCategoryMeta(value),
  })),
)
const sizePresets = computed<SizePreset[]>(() => (mode.value === 'icon' ? [...iconSizePresets] : aspectPresets))
const minDimension = computed(() => (mode.value === 'icon' ? 16 : 128))
const videoDurationFrames = computed(() => Math.max(9, Math.round(videoDuration.value * videoFrameRate.value / 8) * 8 + 1))
const videoNumFrames = computed(() => (videoFrameMode.value === 'eight-n-plus-one' ? videoFrameN.value * 8 + 1 : videoDurationFrames.value))
const videoEstimatedSeconds = computed(() => (videoNumFrames.value / Math.max(1, videoFrameRate.value)).toFixed(1).replace(/\.0$/, ''))
const referenceSummary = computed(() => (referenceImage.value ? '已载入参考图' : referenceRequired.value ? '必须上传' : '可选'))
const previewSummary = computed(() => (generationError.value ? '失败' : resultCount.value ? `${resultCount.value} 个结果` : generating.value ? '生成中' : '待生成'))
const generationParamsSummary = computed(() => selectedModel.value?.name ?? '未选择模型')
const outputSizeSummary = computed(() => `${width.value} × ${height.value}`)
const generationControlSummary = computed(() => `${batchSize.value} 张 · ${steps.value} 步`)
const modeSpecificSummary = computed(() => {
  if (isVideoMode.value) return `${videoNumFrames.value} 帧 · ${videoEstimatedSeconds.value}s`
  if (mode.value === 'txt2img') return `创意 ${creativity.value} · 细节 ${detailLevel.value}`
  if (mode.value === 'img2img') return `强度 ${imageStrength.value} · 姿态 ${poseAdjustment.value}`
  if (mode.value === '3d') return `立体感 ${depthStrength.value}`
  if (mode.value === 'gif') return `${gifDuration.value}s`
  if (mode.value === 'icon') return iconBackground.value === 'transparent' ? '透明底' : iconBackground.value === 'rounded' ? '圆角底' : '纯色底'
  return currentModeLabel.value
})
const toolParamsSummary = computed(() => (activeToolControls.value.length ? `${activeToolControls.value.length} 项` : '无额外参数'))
const availableExportFormatOptions = computed(() => getExportFormatOptions(actionTask.value?.mode ?? mode.value))
const availableIcoExportSizes = computed(() => {
  const maxSide = Math.max(16, Math.min(actionAsset.value?.width ?? width.value, actionAsset.value?.height ?? height.value))
  return getAvailableIcoExportSizes(maxSide)
})
const filteredPrompts = computed(() => {
  const keyword = promptSearch.value.trim().toLowerCase()
  return store.prompts
    .filter((item) => promptCategory.value === '全部' || item.category === promptCategory.value || item.subCategory === promptCategory.value)
    .filter((item) => !keyword || `${item.title} ${item.prompt} ${item.promptZh ?? ''} ${item.promptEn ?? ''} ${item.category} ${item.subCategory}`.toLowerCase().includes(keyword))
})
const promptTotalPages = computed(() => Math.max(1, Math.ceil(filteredPrompts.value.length / promptPageSize)))
const promptCurrentPage = computed(() => Math.min(promptPage.value, promptTotalPages.value))
const visiblePrompts = computed(() => {
  const start = (promptCurrentPage.value - 1) * promptPageSize
  return filteredPrompts.value.slice(start, start + promptPageSize)
})
const currentAssets = computed(() => currentTask.value?.assets ?? [])
const actionTask = computed(() => currentTask.value)
const actionAsset = computed(() => selectedAsset.value ?? currentAssets.value[0] ?? null)
const resultCount = computed(() => (generating.value ? batchSize.value : currentAssets.value.length))
const generateDisabled = computed(() => generating.value || generateCooldown.value)
const promptHasChinese = computed(() => containsChineseText(prompt.value))
const promptLanguageHint = computed(() => {
  if (!prompt.value.trim()) return '支持中文输入；需要英文提示词时可手动点击译英。'
  if (isVideoMode.value) return '视频提示词会通过文本润色模型补充主体、动作、场景、镜头运动和光照。'
  return promptHasChinese.value ? '检测到中文提示词，默认直接发送；需要英文提示词时可手动译英。' : '当前提示词可直接发送给图像模型。'
})
const previewMode = computed<GenerationMode>(() => currentTask.value?.mode ?? mode.value)
const modeOptions = computed<Record<string, string | number | boolean>>(() => {
  // 模式 + 工具控件参数：去掉了 toolId/toolTitle 冗余（仅 Electron 主进程真读的模式/工具参数）
  const options: Record<string, string | number | boolean> = {}
  if (mode.value === 'txt2img') {
    options.creativity = creativity.value
    options.detailLevel = detailLevel.value
    options.poseAdjustment = poseAdjustment.value
    options.lineControl = lineControl.value
  } else if (mode.value === 'img2img') {
    options.imageStrength = imageStrength.value
    options.resizeMode = resizeMode.value
    options.poseAdjustment = poseAdjustment.value
    options.lineControl = lineControl.value
  } else if (mode.value === 'icon') {
    options.background = iconBackground.value
  } else if (mode.value === '3d') {
    options.depthStrength = depthStrength.value
  } else if (mode.value === 'gif') {
    options.durationSeconds = gifDuration.value
  } else if (isVideoMode.value) {
    options.frameMode = videoFrameMode.value
    options.durationSeconds = videoDuration.value
    options.frameRate = videoFrameRate.value
    options.frameN = videoFrameN.value
    options.numFrames = videoNumFrames.value
    options.actionGuidance = actionGuidance.value
    options.facialExpression = facialExpression.value
  }
  for (const control of activeToolControls.value) {
    const value = extraOptions[control.key]
    if (value !== undefined) options[control.key] = value
  }
  return options
})

/** 模式级共享状态（送进 resolveToolEffects） */
const modeState = computed<ModeState>(() => ({
  creativity: creativity.value,
  detailLevel: detailLevel.value,
  imageStrength: imageStrength.value,
  resizeMode: resizeMode.value,
  iconBackground: iconBackground.value,
  depthStrength: depthStrength.value,
  durationSeconds: gifDuration.value,
  poseAdjustment: poseAdjustment.value,
  lineControl: lineControl.value,
  actionGuidance: actionGuidance.value,
  facialExpression: facialExpression.value,
}))

/** 工具的完整效果：prompt 片段 + 尺寸覆盖 + 后处理步骤 + 诚实提示 */
const toolEffects = computed(() => resolveToolEffects(activeTool.value, extraOptions, mode.value, modeState.value))

watch(prompt, (value) => store.setActivePrompt(value))
watch(() => store.activePrompt, (value) => {
  if (value && value !== prompt.value) prompt.value = value
})
watch([promptSearch, promptCategory], () => {
  promptPage.value = 1
})
watch(promptTotalPages, (value) => {
  if (promptPage.value > value) promptPage.value = value
})
watch(defaultModel, (value) => {
  if (!selectedModelId.value || !availableGenerationModels.value.some((model) => model.id === selectedModelId.value)) {
    selectedModelId.value = value?.id ?? ''
  }
})
watch(isVideoMode, () => {
  selectedModelId.value = defaultModel.value?.id ?? ''
  if (isVideoMode.value) batchSize.value = 1
})
watch(exportFormat, (value) => {
  if (!exportOpen.value || value !== 'ico') return
  const allowed = new Set<number>(availableIcoExportSizes.value.map((preset) => preset.width))
  const next = selectedIcoExportSizes.value.filter((size) => allowed.has(size))
  selectedIcoExportSizes.value = next.length ? next : availableIcoExportSizes.value.map((preset) => preset.width)
})
watch(iconExportKind, (value) => {
  if (!exportOpen.value || value === 'png') return
  const allowed = new Set<number>(availableIcoExportSizes.value.map((preset) => preset.width))
  const next = selectedIcoExportSizes.value.filter((size) => allowed.has(size))
  selectedIcoExportSizes.value = next.length ? next : availableIcoExportSizes.value.map((preset) => preset.width)
})

function routeString(name: string): string {
  const value = route.query[name]
  return typeof value === 'string' ? value : ''
}

function routeInteger(name: string, fallback: number, min: number, max: number): number {
  const raw = routeString(name)
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

function modeOptionInteger(options: RouteModeOptions, name: string, fallback: number, min: number, max: number): number {
  const value = options[name]
  if (typeof value !== 'string' && typeof value !== 'number') return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

function routeModeOptions(): RouteModeOptions {
  const raw = routeString('modeOptions')
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return {}
    return parsed as RouteModeOptions
  } catch {
    return {}
  }
}

function applyRouteModeOptions(options: RouteModeOptions): void {
  creativity.value = modeOptionInteger(options, 'creativity', creativity.value, 0, 100)
  detailLevel.value = modeOptionInteger(options, 'detailLevel', detailLevel.value, 0, 100)
  imageStrength.value = modeOptionInteger(options, 'imageStrength', imageStrength.value, 0, 100)
  depthStrength.value = modeOptionInteger(options, 'depthStrength', depthStrength.value, 0, 100)
  poseAdjustment.value = modeOptionInteger(options, 'poseAdjustment', poseAdjustment.value, 0, 100)
  gifDuration.value = modeOptionInteger(options, 'durationSeconds', gifDuration.value, 2, 8)
  videoDuration.value = modeOptionInteger(options, 'durationSeconds', videoDuration.value, 3, 15)
  videoFrameRate.value = modeOptionInteger(options, 'frameRate', videoFrameRate.value, 1, 60)
  videoFrameN.value = modeOptionInteger(options, 'frameN', videoFrameN.value, 1, 55)

  if (options.frameMode === 'duration' || options.frameMode === 'eight-n-plus-one') {
    videoFrameMode.value = options.frameMode
  }

  if (typeof options.lineControl === 'string') lineControl.value = options.lineControl
  if (typeof options.actionGuidance === 'string') actionGuidance.value = options.actionGuidance
  if (typeof options.facialExpression === 'string') facialExpression.value = options.facialExpression

  const nextResizeMode = options.resizeMode
  if (typeof nextResizeMode === 'string' && resizeModeOptions.includes(nextResizeMode as (typeof resizeModeOptions)[number])) {
    resizeMode.value = nextResizeMode
  }

  const nextBackground = options.background
  if (typeof nextBackground === 'string' && iconBackgroundOptions.includes(nextBackground as (typeof iconBackgroundOptions)[number])) {
    iconBackground.value = nextBackground
  }
}

onMounted(() => {
  selectedModelId.value = defaultModel.value?.id ?? ''
  mode.value = store.resolveMode(routeString('mode') || 'txt2img')
  store.setMode(mode.value)
  const toolId = routeString('tool')
  const selectedTool = findToolEntry(toolId) ?? defaultToolForMode(mode.value)
  activeToolId.value = selectedTool?.id ?? ''
  syncActiveToolGroup(activeToolId.value)
  if (selectedTool) mode.value = selectedTool.mode
  applyToolControlDefaults(selectedTool)
  const queryPrompt = routeString('prompt')
  if (queryPrompt) prompt.value = queryPrompt
  else if (routeString('tool') && selectedTool) prompt.value = selectedTool.promptSeed
  else if (store.activePrompt) prompt.value = store.activePrompt
  else if (selectedTool) prompt.value = selectedTool.promptSeed

  const queryNegativePrompt = routeString('negativePrompt')
  if (queryNegativePrompt) negativePrompt.value = queryNegativePrompt
  else if (selectedTool?.negativeSeed) negativePrompt.value = selectedTool.negativeSeed

  const queryStyle = routeString('style')
  if (queryStyle && stylePresets.includes(queryStyle)) style.value = queryStyle
  else if (selectedTool?.style && stylePresets.includes(selectedTool.style)) style.value = selectedTool.style

  const queryModelId = routeString('modelId')
  if (queryModelId && availableGenerationModels.value.some((model) => model.id === queryModelId)) selectedModelId.value = queryModelId
  if (routeString('retryTaskId')) retryNotice.value = '已载入失败任务参数，可重新生成'

  const presetId = routeString('preset') || selectedTool?.preset || ''
  const preset = store.coverPresets.find((item) => item.id === presetId)
  let appliedExplicitSize = false
  if (preset) {
    width.value = preset.width
    height.value = preset.height
    appliedExplicitSize = true
  } else if (selectedTool?.recommendedSize && selectedTool.mode !== 'cover' && selectedTool.mode !== 'icon') {
    width.value = selectedTool.recommendedSize.width
    height.value = selectedTool.recommendedSize.height
    appliedExplicitSize = true
  }

  const routeWidth = routeString('width')
  const routeHeight = routeString('height')
  width.value = routeInteger('width', width.value, 16, 4096)
  height.value = routeInteger('height', height.value, 16, 4096)
  batchSize.value = routeInteger('batchSize', batchSize.value, 1, 4)
  steps.value = routeInteger('steps', steps.value, 1, 80)
  seed.value = routeInteger('seed', seed.value, 0, 999999999)
  applyModeDefaults(mode.value, !routeWidth && !routeHeight && !appliedExplicitSize)
  applyRouteModeOptions(routeModeOptions())
  applyToolControlOverrides(routeModeOptions())
  window.addEventListener('keydown', handleShortcut)
  window.addEventListener('paste', handlePaste)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleShortcut)
  window.removeEventListener('paste', handlePaste)
  if (generateCooldownTimer) window.clearTimeout(generateCooldownTimer)
})

function applyModeDefaults(next: GenerationMode, useDefaultSize = true): void {
  if (next === 'cover') {
    if (!useDefaultSize) return
    const xhs = store.enabledCoverPresets[0] ?? store.coverPresets[0]
    width.value = xhs.width
    height.value = xhs.height
    return
  }

  if (next === 'icon' && useDefaultSize) {
    // ICON 模式默认使用 1024x1024 母图尺寸，导出时再缩放到各规格
    width.value = 1024
    height.value = 1024
  }

  if ((next === 'txt2video' || next === 'img2video') && useDefaultSize) {
    width.value = 1280
    height.value = 720
    batchSize.value = 1
  }
}

function applyToolControlDefaults(tool: ToolEntry | undefined): void {
  for (const key of Object.keys(extraOptions)) delete extraOptions[key]
  for (const control of tool?.extraControls ?? []) {
    extraOptions[control.key] = control.default
  }
}

function syncActiveToolGroup(toolId = activeToolId.value): void {
  const group = toolGroups.find((item) => item.tools.some((tool) => tool.id === toolId))
  activeToolGroupId.value = group?.id ?? toolGroups[0]?.id ?? ''
}

function openToolPicker(): void {
  syncActiveToolGroup()
  toolPickerOpen.value = true
}

function applyToolControlOverrides(options: RouteModeOptions): void {
  for (const control of activeToolControls.value) {
    const value = options[control.key]
    if (typeof value === 'string' || typeof value === 'number') {
      extraOptions[control.key] = value
    }
  }
}

function setMode(next: GenerationMode): void {
  mode.value = next
  store.setMode(next)
  applyModeDefaults(next)
  const tool = defaultToolForMode(next)
  activeToolId.value = tool?.id ?? ''
  applyToolControlDefaults(tool)
  // 切模式时清空旧结果，避免显示别的模式的资产
  currentTask.value = null
  selectedAsset.value = null
  generationError.value = ''
}

function selectTool(tool: ToolEntry): void {
  activeToolId.value = tool.id
  syncActiveToolGroup(tool.id)
  mode.value = tool.mode
  store.setMode(tool.mode)
  applyModeDefaults(tool.mode)
  prompt.value = tool.promptSeed
  // 切工具时按工具种子重置反向提示词，避免旧工具残留
  negativePrompt.value = tool.negativeSeed ?? '低清晰度、变形、文字水印、错误构图'
  if (tool.style && stylePresets.includes(tool.style)) style.value = tool.style
  applyToolControlDefaults(tool)

  const preset = tool.preset ? store.coverPresets.find((item) => item.id === tool.preset) : undefined
  if (preset) {
    width.value = preset.width
    height.value = preset.height
  } else if (tool.recommendedSize && tool.mode !== 'cover' && tool.mode !== 'icon') {
    width.value = tool.recommendedSize.width
    height.value = tool.recommendedSize.height
  }
  // 切工具时清空旧结果
  currentTask.value = null
  selectedAsset.value = null
  generationError.value = ''
  toolPickerOpen.value = false
  store.notify(`已切换到工具：${tool.title}`)
}

function applyAspect(preset: { width: number; height: number }): void {
  width.value = preset.width
  height.value = preset.height
}

function isSizePresetActive(preset: { width: number; height: number }): boolean {
  return width.value === preset.width && height.value === preset.height
}

function promptText(item: PromptItem, language: 'en' | 'zh' = 'en'): string {
  if (language === 'zh') return item.promptZh || item.prompt
  return item.promptEn || item.prompt
}

function applyPrompt(item: PromptItem, language: 'en' | 'zh' = 'en'): void {
  prompt.value = promptText(item, language)
  // 'en' / 'zh' 分支统一：usePrompt 内部按语言取 promptEn/promptZh，并记入历史
  store.usePrompt({ ...item, prompt: prompt.value })
  store.notify(language === 'en' ? `已应用英文提示词：${item.title}` : `已应用中文参考：${item.title}`)
  libraryOpen.value = false
}

function applyThreeDStylePreset(item: ThreeDStylePreset): void {
  setMode('3d')
  prompt.value = item.prompt
  style.value = '3D'
  depthStrength.value = item.depthStrength
  threeDPreviewOpen.value = null
  store.notify(`已应用 3D 风格：${item.name}`)
}

function openPromptLibrary(): void {
  promptCategory.value = '全部'
  promptSearch.value = ''
  promptPage.value = 1
  libraryOpen.value = true
}

function setPromptPage(page: number): void {
  promptPage.value = Math.min(promptTotalPages.value, Math.max(1, Math.round(page)))
}

function previousPromptPage(): void {
  setPromptPage(promptPage.value - 1)
}

function nextPromptPage(): void {
  setPromptPage(promptPage.value + 1)
}

async function polishPrompt(): Promise<void> {
  const source = prompt.value.trim()
  if (!source) {
    prompt.value = `高质量${currentModeLabel.value}，主体明确，${style.value}风格，画面层次清晰，细节丰富。`
    store.notify('已生成基础提示词')
    return
  }

  try {
    const result = await store.polishPrompt(
      {
        prompt: source,
        modeLabel: currentModeLabel.value,
        style: style.value,
        task: isVideoMode.value ? 'video-prompt' : 'polish',
      },
    )
    prompt.value = result.prompt
  } catch (error) {
    store.notify(error instanceof Error ? error.message : '润色提示词失败', 'error')
  }
}

async function polishNegativePrompt(): Promise<void> {
  const source = negativePrompt.value.trim()
  if (!source) {
    negativePrompt.value = activeTool.value?.negativeSeed ?? '低清晰度、变形、文字水印、错误构图'
    store.notify('已填入基础反向提示词')
    return
  }

  polishingNegativePrompt.value = true
  try {
    const result = await store.polishPrompt(
      {
        prompt: source,
        modeLabel: `${currentModeLabel.value}反向提示词`,
        style: '反向约束',
        task: 'negative-prompt',
      },
    )
    negativePrompt.value = result.prompt
  } catch (error) {
    store.notify(error instanceof Error ? error.message : '润色反向提示词失败', 'error')
  } finally {
    polishingNegativePrompt.value = false
  }
}

async function translateCurrentPrompt(): Promise<void> {
  const source = prompt.value.trim()
  if (!source) {
    store.notify('请输入需要翻译的提示词', 'error')
    return
  }
  translatingPrompt.value = true
  try {
    const result = await store.translatePromptToEnglish(
      {
        prompt: source,
        modeLabel: currentModeLabel.value,
        style: style.value,
      },
    )
    prompt.value = result.prompt
  } catch (error) {
    store.notify(error instanceof Error ? error.message : '翻译提示词失败', 'error')
  } finally {
    translatingPrompt.value = false
  }
}

function clearPrompt(): void {
  prompt.value = ''
}

function handleShortcut(event: KeyboardEvent): void {
  if (!event.ctrlKey) return

  const key = event.key.toLowerCase()
  if (key === 'tab') {
    event.preventDefault()
    setMode(mode.value === 'img2img' ? 'txt2img' : 'img2img')
    return
  }
  if (key === 'enter') {
    event.preventDefault()
    void generate()
    return
  }
  if (key === 'd') {
    event.preventDefault()
    clearPrompt()
    return
  }
  if (event.shiftKey && key === 'r') {
    event.preventDefault()
    polishPrompt()
    return
  }
  if (event.shiftKey && key === 'c') {
    event.preventDefault()
    void copySelectedResult()
    return
  }
  if (key === 'l') {
    event.preventDefault()
    openPromptLibrary()
    return
  }
  // C1：让出 Ctrl+S 给浏览器原生"保存网页"，改用 Ctrl+Shift+E 打开导出
  if (event.shiftKey && key === 'e') {
    event.preventDefault()
    openExportDialog()
    return
  }
  if (key === 'u') {
    event.preventDefault()
    setMode('img2img')
    openReferencePicker()
  }
}

async function preparePromptForGeneration(): Promise<string> {
  return buildGenerationPrompt(prompt.value.trim())
}

// toolPromptFragments / modePromptFragments 已被 resolveToolEffects 取代并集中在 domain/tools.ts
// 老函数保留删除以避免 lint unused；如需历史对比请查 git。

function buildGenerationPrompt(source: string): string {
  // 改由 resolveToolEffects 统一决定 prompt 片段（消除 mode 控件与工具控件的重复拼接）
  const base = source.trim()
  return [base, ...toolEffects.value.promptFragments].filter(Boolean).join(', ')
}

function isGifAsset(asset: GeneratedAsset): boolean {
  return asset.format === 'gif' || currentTask.value?.mode === 'gif'
}

function isThreeDAsset(asset: GeneratedAsset): boolean {
  return currentTask.value?.mode === '3d' && !isGifAsset(asset)
}

async function generate(): Promise<void> {
  if (generateDisabled.value) return
  generateCooldown.value = true
  if (generateCooldownTimer) window.clearTimeout(generateCooldownTimer)
  generateCooldownTimer = window.setTimeout(() => {
    generateCooldown.value = false
    generateCooldownTimer = undefined
  }, generateDebounceMs)

  if (referenceRequired.value && !referenceImage.value) {
    currentTask.value = null
    selectedAsset.value = null
    generationError.value = mode.value === 'img2video' ? '图生视频需要先上传参考图' : '当前工具需要先上传参考图'
    store.notify(generationError.value, 'error')
    return
  }
  generating.value = true
  generationError.value = ''
  currentTask.value = null
  selectedAsset.value = null
  // 应用工具的尺寸覆盖（如 id-photo 的 idSpec → 295x413）
  const effects = toolEffects.value
  if (effects.dimensionOverride) {
    width.value = effects.dimensionOverride.width
    height.value = effects.dimensionOverride.height
  }
  try {
    const generationPrompt = await preparePromptForGeneration()
    const task = await store.generate({
      mode: mode.value,
      prompt: generationPrompt,
      negativePrompt: negativePrompt.value,
      modelId: selectedModel.value?.id ?? '',
      width: width.value,
      height: height.value,
      batchSize: batchSize.value,
      steps: steps.value,
      seed: seed.value,
      style: style.value,
      referenceImage: showReferenceBlock.value ? referenceImage.value : '',
      modeOptions: modeOptions.value,
    })
    currentTask.value = task
    selectedAsset.value = task.assets[0] ?? null

    // 工具级真后处理（如 8bit 像素化、icon 圆角、头像圆形裁切、id-photo 背景填色、4x 重采样）
    if (effects.postProcessSteps.length && mode.value !== 'gif' && task.assets.length) {
      try {
        const processedAssets: GeneratedAsset[] = []
        for (const asset of task.assets) {
          const result = await applyPostProcessPipeline(
            { dataUrl: asset.dataUrl, width: asset.width, height: asset.height, format: asset.format },
            effects.postProcessSteps,
          )
          processedAssets.push({ ...asset, dataUrl: result.dataUrl, width: result.width, height: result.height, format: result.format })
        }
        const processedTask: GenerationTask = { ...task, assets: processedAssets }
        currentTask.value = processedTask
        selectedAsset.value = processedAssets[0] ?? null
        store.recordGenerationTask(processedTask)
      } catch (postError) {
        store.notify(postError instanceof Error ? `后处理失败：${postError.message}` : '后处理失败', 'error')
      }
    }

    // 工具的诚实提示（如「去背景蒙版需模型支持」），逐条通知用户
    for (const note of effects.notes) {
      store.notify(note, 'info')
    }

    // GIF 模式：用前端真合成替换模型返回的静态图
    if (mode.value === 'gif' && task.assets.length) {
      try {
        const frameRate = Number(extraOptions.frameRate) || 12
        const loopMode = (String(extraOptions.loopMode) as 'seamless' | 'pingpong' | 'once') || 'seamless'
        const composed = await synthesizeGifDataUrl(
          task.assets.map((asset) => ({ dataUrl: asset.dataUrl, width: asset.width, height: asset.height })),
          {
            width: task.assets[0].width,
            height: task.assets[0].height,
            durationSeconds: gifDuration.value,
            frameRate,
            loopMode,
            loops: 0,
          },
        )
        const gifAsset: GeneratedAsset = {
          ...task.assets[0],
          format: 'gif',
          dataUrl: composed.dataUrl,
          width: composed.width,
          height: composed.height,
        }
        const composedTask: GenerationTask = { ...task, assets: [gifAsset, ...task.assets.slice(1)] }
        currentTask.value = composedTask
        selectedAsset.value = gifAsset
        store.recordGenerationTask(composedTask)
      } catch (gifError) {
        // 合成失败时保留原图，不阻塞流程
        store.notify(gifError instanceof Error ? `动图合成失败：${gifError.message}` : '动图合成失败', 'error')
      }
    }
  } catch (error) {
    generationError.value = error instanceof Error ? error.message : '生成失败'
  } finally {
    window.setTimeout(() => {
      generating.value = false
    }, 650)
  }
}

function openReferencePicker(): void {
  referenceInput.value?.click()
}

function loadReferenceFile(file: File): void {
  if (!file.type.startsWith('image/')) {
    store.notify('请选择图片文件作为参考图', 'error')
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    referenceImage.value = String(reader.result)
    store.notify('参考图已加载')
  }
  reader.readAsDataURL(file)
}

function handleReference(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) loadReferenceFile(file)
  input.value = ''
}

function handleReferenceDrop(event: DragEvent): void {
  const file = Array.from(event.dataTransfer?.files ?? []).find((item) => item.type.startsWith('image/'))
  if (!file) {
    store.notify('请拖入图片文件作为参考图', 'error')
    return
  }

  setMode(isVideoMode.value ? 'img2video' : 'img2img')
  loadReferenceFile(file)
}

function handlePaste(event: ClipboardEvent): void {
  const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith('image/'))
  if (!file) return
  event.preventDefault()
  setMode(isVideoMode.value ? 'img2video' : 'img2img')
  loadReferenceFile(file)
}

function reuseSelectedAsReference(): void {
  const asset = actionAsset.value
  if (!asset) {
    store.notify('请先生成或选择结果', 'error')
    return
  }
  if (asset.mediaType === 'video' || asset.format === 'mp4') {
    store.notify('视频结果不能作为参考图', 'error')
    return
  }
  setMode(isVideoMode.value ? 'img2video' : 'img2img')
  referenceImage.value = asset.dataUrl
  store.notify('已将结果作为参考图')
}

async function copySelectedResult(): Promise<void> {
  const asset = actionAsset.value
  if (!asset) {
    store.notify('请先生成或选择结果', 'error')
    return
  }

  const writeText = navigator.clipboard?.writeText?.bind(navigator.clipboard)
  if (!writeText) {
    store.notify('当前环境不支持复制结果图', 'error')
    return
  }

  try {
    await writeText(asset.remoteUrl ?? asset.dataUrl)
    store.notify(asset.mediaType === 'video' ? '视频链接已复制' : '结果图已复制')
  } catch {
    store.notify('复制结果图失败', 'error')
  }
}

async function downloadSelected(): Promise<void> {
  const asset = actionAsset.value
  if (!asset) {
    store.notify('请先选择结果', 'error')
    return
  }
  if (isIconExport.value) {
    if (iconExportKind.value === 'png') {
      await store.downloadAsset(asset, 'png', exportScale.value, actionTask.value ?? undefined, { customTitle: iconProjectName.value })
    } else if (iconExportKind.value === 'ico') {
      await store.downloadIconBundle(asset, selectedIcoExportSizes.value, iconProjectName.value)
    }
    // ICO 走 downloadIconBundle（统一打包 ZIP）
    exportOpen.value = false
    return
  }
  if (asset.mediaType === 'video' || asset.format === 'mp4') {
    window.open(asset.remoteUrl ?? asset.dataUrl, '_blank', 'noopener,noreferrer')
    store.notify('已打开视频链接，可在浏览器中保存 MP4')
    exportOpen.value = false
    return
  }
  if (exportFormat.value === 'ico' && !selectedIcoExportSizes.value.length) {
    store.notify('请至少勾选一个 ICO 导出尺寸', 'error')
    return
  }
  await store.downloadAsset(
    asset,
    exportFormat.value,
    exportScale.value,
    actionTask.value ?? undefined,
    exportFormat.value === 'ico' ? { iconSizes: selectedIcoExportSizes.value } : undefined,
  )
  exportOpen.value = false
}

function openExportDialog(): void {
  if (!actionAsset.value) {
    store.notify('请先生成或选择结果', 'error')
    return
  }
  if (isIconExport.value) {
    iconExportKind.value = 'ico'
    iconProjectName.value = defaultIconProjectName()
  } else {
    const options = availableExportFormatOptions.value
    exportFormat.value = options.some((option) => option.value === store.settings.defaultExportFormat)
      ? store.settings.defaultExportFormat
      : options[0]?.value ?? 'png'
  }
  exportScale.value = 1
  selectedIcoExportSizes.value = availableIcoExportSizes.value.map((preset) => preset.width)
  exportOpen.value = true
}

async function downloadIconBundle(): Promise<void> {
  const asset = actionAsset.value
  if (!asset) {
    store.notify('请先生成或选择结果', 'error')
    return
  }
  if (!selectedIcoExportSizes.value.length) {
    store.notify('请至少选择一个导出尺寸', 'error')
    return
  }
  await store.downloadIconBundle(asset, selectedIcoExportSizes.value, iconProjectName.value)
  exportOpen.value = false
}

async function chooseWorkspaceExportDir(): Promise<void> {
  const directory = await pickDirectory(store.settings.defaultOutputDir)
  if (!directory) return

  store.saveSettings({ defaultOutputDir: directory })
  store.notify(`已选择导出目录：${directory}`)
}
</script>

<template>
  <div class="page-full workspace-page">
    <section class="workspace-grid">
      <aside class="workspace-pane">
        <div class="block">
          <div class="title-row">
            <strong>创作入口</strong>
            <span>{{ currentModeLabel }}</span>
          </div>
          <button class="tool-summary-card" type="button" @click="openToolPicker">
            <span class="tool-summary-icon">
              <component :is="activeTool ? resolveToolIcon(activeTool.icon) : WandSparkles" :size="18" />
            </span>
            <span class="tool-summary-copy">
              <strong>{{ activeTool?.title ?? currentModeLabel }}</strong>
              <small>{{ activeTool?.subtitle ?? modeDescriptionFallback }}</small>
            </span>
            <span class="tool-summary-meta">{{ currentToolGroup?.name ?? '切换' }}</span>
          </button>
        </div>

        <div class="block">
          <div class="title-row">
            <strong>正向提示词</strong>
            <span>{{ prompt.length }} 字</span>
          </div>
          <p v-if="activeTool?.promptHint" class="tool-prompt-hint">{{ activeTool.promptHint }}</p>
          <button class="prompt-preview" type="button" @click="promptModalOpen = true">
            {{ prompt || '点击打开大编辑器，输入主题、构图、风格、镜头、颜色和平台用途。' }}
          </button>
          <p class="prompt-language-note" :class="{ warn: promptHasChinese }">{{ promptLanguageHint }}</p>
          <p v-if="retryNotice" class="retry-notice">{{ retryNotice }}</p>
          <div class="btn-row">
            <button class="btn-soft" type="button" @click="promptModalOpen = true">编辑</button>
            <button class="btn-soft" type="button" @click="openPromptLibrary">
              <Library :size="15" />
              词库
            </button>
            <button class="btn-soft" type="button" @click="polishPrompt">
              <Sparkles :size="15" />
              润色
            </button>
            <button class="btn-soft" type="button" :disabled="translatingPrompt || !prompt.trim()" @click="translateCurrentPrompt">
              <Sparkles :size="15" />
              {{ translatingPrompt ? '翻译中...' : '译英' }}
            </button>
            <button class="btn-soft" type="button" @click="clearPrompt">
              <RotateCcw :size="15" />
              清空
            </button>
          </div>
          <div class="field">
            <div class="field-label-row">
              <label for="workspace-negative-prompt">反向提示词</label>
              <div class="btn-row mini-actions">
                <button class="btn-soft btn-sm" type="button" :disabled="polishingNegativePrompt || !negativePrompt.trim()" @click="polishNegativePrompt">
                  <Sparkles :size="13" />
                  {{ polishingNegativePrompt ? '润色中...' : 'AI 润色' }}
                </button>
                <button class="btn-soft btn-sm" type="button" @click="negativePrompt = activeTool?.negativeSeed ?? '低清晰度、变形、文字水印、错误构图'">默认</button>
              </div>
            </div>
            <textarea id="workspace-negative-prompt" v-model="negativePrompt" rows="3" />
          </div>
        </div>

        <details v-if="showReferenceBlock" class="workspace-fold-card reference-fold-card">
          <summary>
            <span><strong>参考素材</strong><small>方形上传 / 拖入</small></span>
            <b>{{ referenceSummary }}</b>
          </summary>
          <div class="fold-content">
            <label class="reference-square" @dragover.prevent @drop.prevent="handleReferenceDrop">
              <img v-if="referenceImage" :src="referenceImage" alt="参考图预览" />
              <span v-else class="reference-square-icon">
                <Upload :size="22" />
              </span>
              <strong>{{ referenceImage ? '点击替换参考图' : '上传参考图' }}</strong>
              <small>{{ referenceRequired ? '当前工具必须上传参考图' : '可选，支持拖入图片' }}</small>
              <input ref="referenceInput" type="file" accept="image/*" hidden @change="handleReference" />
            </label>
          </div>
        </details>

        <details class="workspace-fold-card">
          <summary>
            <span><strong>风格预设</strong><small>点击后展开选择</small></span>
            <b>{{ style }}</b>
          </summary>
          <div class="fold-content">
            <div class="chip-grid">
              <button v-for="item in stylePresets" :key="item" class="chip-button" :class="{ active: style === item }" type="button" @click="style = item">
                {{ item }}
              </button>
            </div>
          </div>
        </details>

        <details v-if="mode === '3d'" class="workspace-fold-card three-d-reference-block">
          <summary>
            <span><strong>3D 风格参考</strong><small>点击查看预览</small></span>
            <b>{{ threeDStylePresets.length }} 组</b>
          </summary>
          <div class="fold-content">
            <div class="three-d-reference-list">
              <button
                v-for="item in threeDStylePresets"
                :key="item.id"
                class="three-d-reference-card"
                type="button"
                :aria-label="`查看${item.name}`"
                @click="threeDPreviewOpen = item"
              >
                <img :src="item.preview" :alt="`${item.name} 参考图`" />
                <span>
                  <strong>{{ item.name }}</strong>
                  <small>{{ item.tone }} · 立体感 {{ item.depthStrength }}</small>
                </span>
              </button>
            </div>
          </div>
        </details>
      </aside>

      <section class="workspace-center">
        <div class="tool-banner">
          <div class="tool-banner-copy">
            <strong class="tool-banner-title">{{ workspaceTitle }}</strong>
            <span class="tool-banner-subtitle">{{ workspaceSubtitle }}</span>
          </div>
          <span v-if="recommendedSizeLabel" class="chip">推荐 {{ recommendedSizeLabel }}</span>
        </div>

        <details class="workspace-fold-card result-fold-card" open>
          <summary>
            <span><strong>生成预览</strong><small>展开查看结果画布和导出操作</small></span>
            <b>{{ previewSummary }}</b>
          </summary>
          <div class="fold-content result-fold-content">
            <div class="result-card">
              <div class="stage">
                <div v-if="generating" class="generating">
                  <div class="mode-preview" :class="`mode-preview-${previewMode}`">
                    <template v-if="previewMode === 'gif'">
                      <div class="gif-preview-strip">
                        <span />
                        <span />
                        <span />
                        <span />
                      </div>
                      <strong>GIF</strong>
                    </template>
                    <template v-else-if="previewMode === '3d'">
                      <div class="three-d-preview-scene" aria-hidden="true">
                        <span class="three-d-preview-cube">
                          <i />
                          <i />
                          <i />
                        </span>
                      </div>
                      <strong>3D</strong>
                    </template>
                    <div v-else class="media-preview-shape" :class="isVideoMode ? 'media-preview-video' : 'media-preview-image'">
                      <span class="media-sun" />
                      <span class="media-mountain media-mountain-a" />
                      <span class="media-mountain media-mountain-b" />
                      <span class="media-play" />
                      <span class="media-film-dots"><i /><i /><i /><i /></span>
                      <strong>{{ isVideoMode ? 'VIDEO' : 'IMAGE' }}</strong>
                    </div>
                  </div>
                  <strong>正在调用生成流程...</strong>
                  <p class="muted">校验提示词、组合参数并写入资产库</p>
                </div>
                <div v-else-if="currentAssets.length" class="samples">
                  <button
                    v-for="asset in currentAssets"
                    :key="asset.id"
                    class="sample"
                    :class="{ selected: selectedAsset?.id === asset.id }"
                    type="button"
                    @click="selectedAsset = asset"
                  >
                    <span
                      class="sample-media"
                      :class="{ 'sample-media-gif': isGifAsset(asset), 'sample-media-3d': isThreeDAsset(asset) }"
                    >
                      <video v-if="asset.mediaType === 'video' || asset.format === 'mp4'" :src="asset.remoteUrl ?? asset.dataUrl" muted controls playsinline />
                      <img v-else :src="asset.dataUrl" :alt="asset.title" />
                      <span v-if="isGifAsset(asset)" class="preview-badge">GIF</span>
                      <span v-if="isThreeDAsset(asset)" class="preview-badge">3D</span>
                      <span v-if="asset.mediaType === 'video' || asset.format === 'mp4'" class="preview-badge">MP4</span>
                    </span>
                    <span>{{ asset.title }}</span>
                  </button>
                </div>
                <div v-else-if="generationError" class="empty-stage error-stage">
                  <WandSparkles :size="42" />
                  <strong>生成失败</strong>
                  <p>{{ generationError }}</p>
                  <button class="btn-soft" type="button" @click="generate">重新生成</button>
                </div>
                <div v-else class="empty-stage">
                  <div
                    v-if="mode === 'gif' || mode === '3d'"
                    class="mode-preview mode-preview-idle"
                    :class="`mode-preview-${mode}`"
                  >
                    <template v-if="mode === 'gif'">
                      <div class="gif-preview-strip">
                        <span />
                        <span />
                        <span />
                        <span />
                      </div>
                      <strong>GIF</strong>
                    </template>
                    <template v-else>
                      <div class="three-d-preview-scene" aria-hidden="true">
                        <span class="three-d-preview-cube">
                          <i />
                          <i />
                          <i />
                        </span>
                      </div>
                      <strong>3D</strong>
                    </template>
                  </div>
                  <div class="media-preview-shape mode-preview-idle" :class="isVideoMode ? 'media-preview-video' : 'media-preview-image'">
                    <span class="media-sun" />
                    <span class="media-mountain media-mountain-a" />
                    <span class="media-mountain media-mountain-b" />
                    <span class="media-play" />
                    <span class="media-film-dots"><i /><i /><i /><i /></span>
                    <strong>{{ isVideoMode ? 'VIDEO' : 'IMAGE' }}</strong>
                  </div>
                  <strong>准备生成</strong>
                  <p>输入提示词后点击“开始生成”。</p>
                </div>
              </div>
              <div class="result-foot">
                <div>
                  <strong>{{ selectedAsset ? `已选择：${selectedAsset.title}` : '尚未选择结果' }}</strong>
                  <p class="muted">{{ width }} x {{ height }} · {{ style }} · {{ selectedModel?.name }}</p>
                </div>
                <div class="btn-row">
                  <button class="btn-soft" type="button" @click="copySelectedResult">
                    <Copy :size="15" />
                    {{ selectedAsset?.mediaType === 'video' || selectedAsset?.format === 'mp4' ? '复制视频链接' : '复制结果图' }}
                  </button>
                  <button class="btn-soft" type="button" :disabled="selectedAsset?.mediaType === 'video' || selectedAsset?.format === 'mp4'" @click="reuseSelectedAsReference">作为参考图</button>
                  <button class="btn-primary" type="button" @click="openExportDialog">
                    <Download :size="15" />
                    导出
                  </button>
                </div>
              </div>
            </div>
          </div>
        </details>
      </section>

      <aside class="workspace-pane">
        <details class="workspace-fold-card">
          <summary>
            <span><strong>生成参数</strong><small>模型与润色通道</small></span>
            <b>{{ generationParamsSummary }}</b>
          </summary>
          <div class="fold-content">
            <div class="field">
              <label for="workspace-image-model">{{ isVideoMode ? '视频模型' : '图像模型' }}</label>
              <select id="workspace-image-model" v-model="selectedModelId">
                <option v-for="model in availableGenerationModels" :key="model.id" :value="model.id">{{ model.name }} / {{ model.model }}</option>
              </select>
            </div>
            <p v-if="isVideoMode" class="field-note">Agnes 视频会创建异步任务并轮询结果；文生视频仅使用提示词，图生视频会临时上传参考图。</p>
            <div class="route-info-card">
              <span>文本生成 / AI 润色</span>
              <strong>{{ textAutoRouteSummary }}</strong>
              <small>正向润色、反向提示词润色和译英统一走文本模型 auto 路由；可用文本上游会按主模型与连接状态自动回退。</small>
            </div>
          </div>
        </details>

        <details class="workspace-fold-card">
          <summary>
            <span><strong>输出尺寸</strong><small>比例与像素尺寸</small></span>
            <b>{{ outputSizeSummary }}</b>
          </summary>
          <div class="fold-content">
            <template v-if="mode === 'icon'">
              <div class="icon-size-grid">
                <div
                  v-for="preset in sizePresets"
                  :key="preset.id"
                  class="icon-size-card"
                >
                  <strong>{{ preset.name }}</strong>
                  <small>{{ preset.hint }}</small>
                </div>
              </div>
              <p class="field-note">ICON 模式固定生成 1024×1024 母图，导出时可选择各尺寸打包下载。</p>
            </template>
            <template v-else>
              <div class="chip-grid">
                <button
                  v-for="preset in sizePresets"
                  :key="preset.id"
                  class="chip-button"
                  :class="{ active: isSizePresetActive(preset) }"
                  type="button"
                  @click="applyAspect(preset)"
                >
                  {{ preset.name }}
                </button>
              </div>
              <div class="param-two">
                <div class="field">
                  <label for="workspace-width">宽度</label>
                  <input id="workspace-width" v-model.number="width" type="number" :min="minDimension" max="4096" />
                </div>
                <div class="field">
                  <label for="workspace-height">高度</label>
                  <input id="workspace-height" v-model.number="height" type="number" :min="minDimension" max="4096" />
                </div>
              </div>
            </template>
          </div>
        </details>

        <details class="workspace-fold-card">
          <summary>
            <span><strong>生成控制</strong><small>批量、步数、Seed</small></span>
            <b>{{ generationControlSummary }}</b>
          </summary>
          <div class="fold-content">
            <div class="range-row"><span>批量</span><input v-model.number="batchSize" type="range" min="1" :max="isVideoMode ? 1 : 4" /><b>{{ batchSize }}</b></div>
            <div class="range-row"><span>步数</span><input v-model.number="steps" type="range" min="1" max="80" /><b>{{ steps }}</b></div>
            <div class="field">
              <label>Seed</label>
              <input v-model.number="seed" type="number" />
            </div>
          </div>
        </details>

        <details class="workspace-fold-card">
          <summary>
            <span><strong>模式专属</strong><small>{{ currentModeLabel }} 参数</small></span>
            <b>{{ modeSpecificSummary }}</b>
          </summary>
          <div class="fold-content">
            <template v-if="mode === 'txt2img'">
              <div class="range-row"><label for="workspace-creativity">创意度</label><input id="workspace-creativity" v-model.number="creativity" type="range" min="0" max="100" /><b>{{ creativity }}</b></div>
              <div class="range-row"><label for="workspace-detail-level">细节</label><input id="workspace-detail-level" v-model.number="detailLevel" type="range" min="0" max="100" /><b>{{ detailLevel }}</b></div>
              <div class="range-row"><label for="workspace-pose-adjustment">姿态微调</label><input id="workspace-pose-adjustment" v-model.number="poseAdjustment" type="range" min="0" max="100" /><b>{{ poseAdjustment }}</b></div>
              <div class="field">
                <label for="workspace-line-control">线条控制</label>
                <select id="workspace-line-control" v-model="lineControl">
                  <option value="natural">自然线条</option>
                  <option value="clean-contour">清晰轮廓</option>
                  <option value="soft-linework">柔和线稿</option>
                  <option value="bold-linework">粗线条</option>
                  <option value="minimal-lines">极简线条</option>
                </select>
              </div>
            </template>
            <template v-else-if="mode === 'img2img'">
              <div class="range-row"><label for="workspace-image-strength">图片强度</label><input id="workspace-image-strength" v-model.number="imageStrength" type="range" min="0" max="100" /><b>{{ imageStrength }}</b></div>
              <div class="range-row"><label for="workspace-img-pose-adjustment">姿态微调</label><input id="workspace-img-pose-adjustment" v-model.number="poseAdjustment" type="range" min="0" max="100" /><b>{{ poseAdjustment }}</b></div>
              <div class="field">
                <label for="workspace-img-line-control">线条控制</label>
                <select id="workspace-img-line-control" v-model="lineControl">
                  <option value="natural">自然线条</option>
                  <option value="clean-contour">清晰轮廓</option>
                  <option value="soft-linework">柔和线稿</option>
                  <option value="bold-linework">粗线条</option>
                  <option value="minimal-lines">极简线条</option>
                </select>
              </div>
              <div class="field">
                <label for="workspace-resize-mode">Resize Mode</label>
                <select id="workspace-resize-mode" v-model="resizeMode">
                  <option value="just-resize">Just resize</option>
                  <option value="crop-resize">Crop and resize</option>
                  <option value="resize-fill">Resize and fill</option>
                </select>
              </div>
            </template>
            <template v-else-if="isVideoMode">
              <div class="segmented-row">
                <button class="chip-button" :class="{ active: videoFrameMode === 'duration' }" type="button" @click="videoFrameMode = 'duration'">按时长</button>
                <button class="chip-button" :class="{ active: videoFrameMode === 'eight-n-plus-one' }" type="button" @click="videoFrameMode = 'eight-n-plus-one'">8n + 1</button>
              </div>
              <div v-if="videoFrameMode === 'duration'" class="chip-grid">
                <button class="chip-button" :class="{ active: videoDuration === 3 }" type="button" :disabled="videoFrameMode !== 'duration'" @click="videoDuration = 3">约 3s</button>
                <button class="chip-button" :class="{ active: videoDuration === 5 }" type="button" :disabled="videoFrameMode !== 'duration'" @click="videoDuration = 5">约 5s</button>
                <button class="chip-button" :class="{ active: videoDuration === 10 }" type="button" :disabled="videoFrameMode !== 'duration'" @click="videoDuration = 10">约 10s</button>
                <button class="chip-button" :class="{ active: videoDuration === 15 }" type="button" :disabled="videoFrameMode !== 'duration'" @click="videoDuration = 15">约 15s</button>
              </div>
              <div v-if="videoFrameMode === 'eight-n-plus-one'" class="chip-grid">
                <button
                  v-for="preset in eightNFramePresets"
                  :key="preset.n"
                  class="chip-button"
                  :class="{ active: videoFrameN === preset.n }"
                  type="button"
                  @click="videoFrameN = preset.n"
                >
                  {{ preset.label }} · {{ preset.seconds }}
                </button>
              </div>
              <div class="range-row"><label for="workspace-video-fps">帧率</label><input id="workspace-video-fps" v-model.number="videoFrameRate" type="range" min="1" max="60" /><b>{{ videoFrameRate }}fps</b></div>
              <div v-if="videoFrameMode === 'eight-n-plus-one'" class="range-row"><label for="workspace-video-frame-n">n 值</label><input id="workspace-video-frame-n" v-model.number="videoFrameN" type="range" min="1" max="55" /><b>{{ videoFrameN }}</b></div>
              <div class="field">
                <label for="workspace-action-guidance">动作指导</label>
                <textarea id="workspace-action-guidance" v-model="actionGuidance" rows="2" placeholder="例如：先抬头看向镜头，再自然微笑，最后轻微向右转头" />
              </div>
              <div class="field">
                <label for="workspace-facial-expression">面部表情</label>
                <select id="workspace-facial-expression" v-model="facialExpression">
                  <option value="natural">自然</option>
                  <option value="subtle-smile">微笑</option>
                  <option value="confident">自信</option>
                  <option value="calm">平静</option>
                  <option value="surprised">惊讶</option>
                  <option value="talking">说话口型</option>
                </select>
              </div>
              <p class="field-note">实际提交 {{ videoNumFrames }} 帧，预计 {{ videoEstimatedSeconds }}s，{{ videoFrameMode === 'eight-n-plus-one' ? `按 8 × ${videoFrameN} + 1 计算` : `由时长换算为 8n + 1` }}。</p>
            </template>
            <template v-else-if="mode === 'icon'">
              <div class="chip-grid">
                <button class="chip-button" :class="{ active: iconBackground === 'transparent' }" type="button" @click="iconBackground = 'transparent'">透明底</button>
                <button class="chip-button" :class="{ active: iconBackground === 'rounded' }" type="button" @click="iconBackground = 'rounded'">圆角底</button>
                <button class="chip-button" :class="{ active: iconBackground === 'solid' }" type="button" @click="iconBackground = 'solid'">纯色底</button>
              </div>
            </template>
            <template v-else-if="mode === '3d'">
              <div class="range-row"><label for="workspace-depth-strength">立体感</label><input id="workspace-depth-strength" v-model.number="depthStrength" type="range" min="0" max="100" /><b>{{ depthStrength }}</b></div>
            </template>
            <template v-else-if="mode === 'gif'">
              <div class="range-row"><label for="workspace-gif-duration">时长</label><input id="workspace-gif-duration" v-model.number="gifDuration" type="range" min="2" max="8" /><b>{{ gifDuration }}s</b></div>
            </template>
            <template v-else>
              <p class="muted">封面图使用输出尺寸和风格预设控制平台效果。</p>
            </template>
          </div>
        </details>

        <details class="workspace-fold-card tool-controls-block">
          <summary>
            <span><strong>工具参数</strong><small>{{ activeTool?.title ?? currentModeLabel }}</small></span>
            <b>{{ toolParamsSummary }}</b>
          </summary>
          <div class="fold-content">
            <p v-if="!activeToolControls.length" class="muted">当前入口没有额外工具参数。</p>
            <div v-for="control in activeToolControls" :key="control.key" class="tool-control">
              <template v-if="control.type === 'range'">
                <div class="range-row">
                  <label :for="`tool-control-${control.key}`">{{ control.label }}</label>
                  <input
                    :id="`tool-control-${control.key}`"
                    v-model.number="extraOptions[control.key]"
                    type="range"
                    :min="control.min ?? 0"
                    :max="control.max ?? 100"
                    :step="control.step ?? 1"
                  />
                  <b>{{ extraOptions[control.key] }}{{ control.unit ?? '' }}</b>
                </div>
              </template>
              <template v-else-if="control.type === 'select'">
                <div class="field">
                  <label :for="`tool-control-${control.key}`">{{ control.label }}</label>
                  <select :id="`tool-control-${control.key}`" v-model="extraOptions[control.key]">
                    <option v-for="option in control.options" :key="option.value" :value="option.value">{{ option.label }}</option>
                  </select>
                </div>
              </template>
              <template v-else-if="control.type === 'chips'">
                <div class="field">
                  <label>{{ control.label }}</label>
                  <div class="chip-grid">
                    <button
                      v-for="option in control.options"
                      :key="option.value"
                      class="chip-button"
                      :class="{ active: extraOptions[control.key] === option.value }"
                      type="button"
                      :aria-label="`${control.label} ${option.label}`"
                      @click="extraOptions[control.key] = option.value"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>
              </template>
              <p v-if="control.hint" class="field-note">{{ control.hint }}</p>
            </div>
          </div>
        </details>

        <details class="workspace-fold-card mode-flow-block">
          <summary>
            <span><strong>数据流说明</strong><small>当前模式流程</small></span>
            <b>{{ currentModeLabel }}</b>
          </summary>
          <div class="fold-content">
            <p class="muted">{{ modeFlowCopy }}</p>
          </div>
        </details>

        <details v-if="activeToolTips.length" class="workspace-fold-card tool-tips-block">
          <summary>
            <span><strong>使用提示</strong><small>{{ activeTool?.title }}</small></span>
            <b>{{ activeToolTips.length }} 条</b>
          </summary>
          <div class="fold-content">
            <ul class="tool-tips">
              <li v-for="(tip, index) in activeToolTips" :key="index">{{ tip }}</li>
            </ul>
          </div>
        </details>
      </aside>
    </section>

    <button
      class="floating-generate-btn btn-primary"
      type="button"
      :disabled="generateDisabled"
      @click="generate"
    >
      <WandSparkles :size="17" />
      {{ generating ? '生成中...' : '开始生成' }}
    </button>

    <div v-if="toolPickerOpen" class="modal-overlay" @click.self="toolPickerOpen = false">
      <div class="modal tool-picker-modal" role="dialog" aria-modal="true" aria-labelledby="tool-picker-title">
        <div class="modal-head">
          <div>
            <h2 id="tool-picker-title">选择创作入口</h2>
            <p class="muted">文生图、图生图、封面、图标和视频入口集中在弹窗里，工作台不再被长列表撑高。</p>
          </div>
          <button class="btn-icon" type="button" @click="toolPickerOpen = false">×</button>
        </div>
        <div class="modal-body tool-picker-modal-body">
          <div class="tool-picker compact-tool-picker">
            <div class="tool-group-tabs" aria-label="创作入口分类">
              <button
                v-for="group in toolGroups"
                :key="group.id"
                class="tool-group-tab"
                :class="{ active: activeToolGroupId === group.id }"
                type="button"
                @click="activeToolGroupId = group.id"
              >
                <strong>{{ group.name }}</strong>
                <small>{{ group.tools.length }} 个</small>
              </button>
            </div>
            <div class="tool-picker-group active-tool-group">
              <p class="tool-picker-group-name">
                <span>{{ activeToolGroup?.name }}</span>
                <small>{{ activeToolGroupTools.length }} 个入口</small>
              </p>
              <div class="tool-grid">
                <button
                  v-for="tool in activeToolGroupTools"
                  :key="tool.id"
                  class="select-card tool-pick-card"
                  :class="{ active: activeToolId === tool.id }"
                  type="button"
                  @click="selectTool(tool)"
                >
                  <span class="tool-pick-icon">
                    <component :is="resolveToolIcon(tool.icon)" :size="14" />
                  </span>
                  <span>{{ tool.title }}</span>
                  <small>{{ tool.subtitle ?? modeLabels[tool.mode] }}</small>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="promptModalOpen" class="modal-overlay" @click.self="promptModalOpen = false">
      <div class="modal prompt-modal">
        <div class="modal-head">
          <div>
            <h2>编辑正向提示词</h2>
            <p class="muted">{{ promptLanguageHint }}</p>
          </div>
          <button class="btn-icon" type="button" @click="promptModalOpen = false">×</button>
        </div>
        <div class="modal-body prompt-modal-body">
          <textarea v-model="prompt" class="prompt-editor" rows="12" placeholder="输入更完整的正向提示词" />
        </div>
        <div class="modal-foot">
          <div class="btn-row">
            <button class="btn-soft" type="button" @click="openPromptLibrary">从词库选择</button>
            <button class="btn-soft" type="button" @click="polishPrompt">AI 润色</button>
            <button class="btn-soft" type="button" :disabled="translatingPrompt || !prompt.trim()" @click="translateCurrentPrompt">{{ translatingPrompt ? '翻译中...' : '译英' }}</button>
            <button class="btn-soft" type="button" @click="clearPrompt">清空</button>
          </div>
          <button class="btn-primary" type="button" @click="promptModalOpen = false">应用到工作台</button>
        </div>
      </div>
    </div>

    <div v-if="libraryOpen" class="modal-overlay" @click.self="libraryOpen = false">
      <div class="modal library-modal" role="dialog" aria-modal="true" aria-labelledby="prompt-library-title">
        <div class="modal-head">
          <div>
            <h2 id="prompt-library-title">提示词库</h2>
            <p class="muted">选择提示词，一键应用到当前工作台。</p>
          </div>
          <button class="btn-icon" type="button" @click="libraryOpen = false">×</button>
        </div>
        <div class="modal-body library-modal-body">
          <div class="library-grid">
            <aside class="library-categories" aria-label="提示词分类">
              <button
                v-for="category in promptCategoryOptions"
                :key="category.value"
                class="category-button"
                :class="{ active: promptCategory === category.value }"
                type="button"
                @click="promptCategory = category.value"
              >
                <component :is="category.icon" :size="15" aria-hidden="true" />
                <span class="category-label">{{ category.label }}</span>
              </button>
            </aside>
            <main class="library-main">
              <div class="library-toolbar">
                <input v-model="promptSearch" class="library-search" placeholder="搜索提示词" />
              </div>
              <div class="prompt-list">
                <article v-for="item in visiblePrompts" :key="item.id" class="prompt-item">
                  <div class="prompt-item-copy">
                    <div class="inline"><strong>{{ item.title }}</strong><span class="chip">{{ item.source }}</span><span class="chip accent">{{ resolvePromptCategoryMeta(item.category).label }}</span><span v-if="item.subCategory" class="chip">{{ resolvePromptCategoryMeta(item.subCategory).label }}</span></div>
                    <p>{{ promptText(item, 'en') }}</p>
                    <small v-if="item.promptZh" class="prompt-zh">{{ item.promptZh }}</small>
                  </div>
                  <div class="prompt-item-actions">
                    <button class="btn-primary btn-sm prompt-item-action" type="button" @click="applyPrompt(item, 'en')">用英文</button>
                    <button v-if="item.promptZh" class="btn-soft btn-sm prompt-item-action" type="button" @click="applyPrompt(item, 'zh')">用中文</button>
                  </div>
                </article>
              </div>
              <div v-if="filteredPrompts.length" class="prompt-pagination" aria-label="提示词分页">
                <span>{{ filteredPrompts.length }} 条 · 第 {{ promptCurrentPage }} / {{ promptTotalPages }} 页</span>
                <div class="btn-row">
                  <button class="btn-soft btn-sm" type="button" :disabled="promptCurrentPage <= 1" @click="previousPromptPage">上一页</button>
                  <button class="btn-soft btn-sm" type="button" :disabled="promptCurrentPage >= promptTotalPages" @click="nextPromptPage">下一页</button>
                </div>
              </div>
              <p v-else class="empty-prompt-library">没有匹配的提示词</p>
            </main>
          </div>
        </div>
      </div>
    </div>

    <div v-if="threeDPreviewOpen" class="modal-overlay" @click.self="threeDPreviewOpen = null">
      <div class="modal three-d-preview-modal">
        <div class="modal-head">
          <div>
            <h2>{{ threeDPreviewOpen.name }}</h2>
            <p class="muted">{{ threeDPreviewOpen.tone }} · 立体感 {{ threeDPreviewOpen.depthStrength }}</p>
          </div>
          <button class="btn-icon" type="button" @click="threeDPreviewOpen = null">×</button>
        </div>
        <div class="modal-body three-d-preview-body">
          <img :src="threeDPreviewOpen.preview" :alt="`${threeDPreviewOpen.name} 3D 参考图`" />
          <div class="stack">
            <div class="prompt-box">{{ threeDPreviewOpen.prompt }}</div>
            <button class="btn-primary" type="button" @click="applyThreeDStylePreset(threeDPreviewOpen)">应用此风格</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="exportOpen" class="modal-overlay" @click.self="exportOpen = false">
      <div class="modal">
        <div class="modal-head">
          <div>
            <h2>导出结果</h2>
            <p class="muted">浏览器预览会保存到下载目录；桌面版会使用设置中的默认输出目录。</p>
          </div>
          <button class="btn-icon" type="button" @click="exportOpen = false">×</button>
        </div>
        <div class="modal-body stack">
          <div class="field">
            <label for="workspace-export-dir">导出目录</label>
            <div class="directory-picker">
              <input id="workspace-export-dir" v-model="store.settings.defaultOutputDir" />
              <button class="btn-soft" type="button" @click="chooseWorkspaceExportDir">
                <FolderOpen :size="16" />
                重新选择目录
              </button>
            </div>
          </div>
          <div class="field">
            <label for="workspace-export-format">格式</label>
            <select v-if="isIconExport" id="workspace-export-format" v-model="iconExportKind">
              <option v-for="option in iconExportFormatOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
            <select v-else id="workspace-export-format" v-model="exportFormat">
              <option v-for="option in availableExportFormatOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </div>
          <template v-if="isIconExport">
            <div class="field">
              <label for="workspace-icon-project-name">项目名称</label>
              <input id="workspace-icon-project-name" v-model="iconProjectName" placeholder="默认使用时间戳命名" />
              <p class="field-note">PNG 导出文件名为 <code>{{ iconProjectName || defaultIconProjectName() }}.png</code>；ICO 每个尺寸导出为 <code>{{ iconProjectName || defaultIconProjectName() }}_尺寸x尺寸.ico</code>，全部打包为一个 ZIP。</p>
            </div>
            <div v-if="iconExportKind !== 'png'" class="field">
              <label>导出尺寸</label>
              <div class="ico-size-checks">
                <label v-for="preset in availableIcoExportSizes" :key="preset.id" class="ico-size-check">
                  <input
                    :aria-label="`导出尺寸 ${preset.name}`"
                    :value="preset.width"
                    v-model="selectedIcoExportSizes"
                    type="checkbox"
                  />
                  <span>{{ preset.name }}<small v-if="preset.hint"> · {{ preset.hint }}</small></span>
                </label>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="field">
              <label for="workspace-export-scale">倍率</label>
              <select id="workspace-export-scale" v-model.number="exportScale">
                <option :value="1">1x 原尺寸</option>
                <option :value="2">2x 高清</option>
                <option :value="4">4x 超清</option>
              </select>
            </div>
          </template>
        </div>
        <div class="modal-foot">
          <button class="btn-primary" type="button" @click="isIconExport && iconExportKind === 'ico' ? downloadIconBundle() : downloadSelected()">{{ iconExportButtonLabel }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workspace-page {
  padding: 0;
  min-height: calc(100vh - var(--titlebar-h) - var(--shell-nav-h) - var(--app-topbar-h));
  background:
    radial-gradient(circle at 50% 4%, rgba(87, 166, 255, 0.10), transparent 30%),
    radial-gradient(circle at 88% 44%, rgba(46, 232, 200, 0.08), transparent 22%);
}

.workspace-grid {
  display: grid;
  grid-template-columns: minmax(280px, 296px) minmax(0, 1fr) minmax(280px, 296px);
  min-height: inherit;
  align-items: start;
  gap: 0;
}

.workspace-pane {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, .070), rgba(255, 255, 255, .030)),
    var(--tint);
  min-width: 0;
  overflow: visible;
  backdrop-filter: blur(22px) saturate(130%);
  position: sticky;
  top: var(--app-topbar-h);
  max-height: calc(100vh - var(--app-topbar-h));
  overflow-y: auto;
}

.workspace-pane:first-child {
  border-right: 1px solid var(--border);
}

.workspace-pane:last-child {
  border-left: 1px solid var(--border);
}

.block {
  padding: 16px;
  border-bottom: 1px solid var(--border-soft);
  display: grid;
  gap: 12px;
}

.block:hover {
  background: rgba(255, 255, 255, 0.026);
}

.workspace-fold-card {
  margin: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.025)),
    var(--surface);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  overflow: hidden;
}

.workspace-fold-card + .workspace-fold-card {
  margin-top: 10px;
}

.workspace-fold-card > summary {
  min-height: 58px;
  padding: 11px 13px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 18px;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
  list-style: none;
}

.workspace-fold-card > summary::-webkit-details-marker {
  display: none;
}

.workspace-fold-card > summary::after {
  content: "";
  width: 8px;
  height: 8px;
  border-right: 2px solid var(--muted);
  border-bottom: 2px solid var(--muted);
  transform: rotate(45deg);
  transition: transform 160ms, border-color 160ms;
}

.workspace-fold-card[open] > summary::after {
  transform: rotate(225deg);
  border-color: var(--accent);
}

.workspace-fold-card > summary:hover {
  background: var(--accent-soft);
}

.workspace-fold-card > summary span {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.workspace-fold-card > summary strong {
  color: var(--fg);
  font-size: 14px;
  font-weight: 750;
}

.workspace-fold-card > summary small {
  color: var(--muted);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-fold-card > summary b {
  max-width: 132px;
  padding: 5px 9px;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 750;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fold-content {
  padding: 0 13px 14px;
  display: grid;
  gap: 12px;
}

.field-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.mini-actions {
  flex: 0 0 auto;
  gap: 6px;
}

.title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
}

.title-row strong {
  color: var(--fg);
  font-family: var(--font-body);
  font-size: 14px;
}

.mode-grid,
.chip-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.select-card,
.chip-button {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, .045);
  color: var(--fg-2);
  transition: transform 150ms, border-color 150ms, background 150ms, color 150ms, box-shadow 150ms;
}

.select-card:hover,
.chip-button:hover {
  border-color: var(--border-glow);
  color: var(--fg);
  transform: translateY(-1px);
}

.mode-card {
  min-height: 74px;
  display: grid;
  place-items: center;
  padding: 8px;
  text-align: center;
}

.mode-card small {
  display: none;
}

.select-card.active,
.chip-button.active {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}

.tool-picker {
  display: grid;
  gap: 14px;
}

.tool-summary-card {
  width: 100%;
  min-height: 72px;
  padding: 12px;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  color: var(--fg-2);
  text-align: left;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background:
    linear-gradient(135deg, rgba(87, 166, 255, 0.10), rgba(46, 232, 200, 0.06)),
    var(--surface);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  transition: transform 160ms, border-color 160ms, background 160ms, box-shadow 160ms;
}

.tool-summary-card:hover {
  color: var(--fg);
  border-color: var(--accent);
  background: var(--accent-soft);
  box-shadow: var(--focus-ring);
  transform: translateY(-1px);
}

.tool-summary-icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  color: var(--accent-on);
  border-radius: 12px;
  background: linear-gradient(135deg, var(--accent), var(--accent-3));
}

.tool-summary-copy {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.tool-summary-copy strong,
.tool-summary-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-summary-copy strong {
  color: var(--fg);
  font-size: 14px;
  font-weight: 750;
}

.tool-summary-copy small {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.35;
}

.tool-summary-meta {
  padding: 5px 9px;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 700;
}

.tool-picker-group {
  display: grid;
  gap: 10px;
}

.tool-picker-group-name {
  margin: 0;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.04em;
}

.tool-picker-group-name span,
.tool-picker-group-name small {
  display: block;
}

.tool-picker-group-name span {
  color: var(--fg);
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 750;
  letter-spacing: 0;
}

.tool-picker-group-name small {
  margin-top: 3px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0;
}

.tool-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.tool-pick-card {
  min-height: 58px;
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-areas:
    "icon title"
    "icon sub";
  align-items: center;
  column-gap: 8px;
  padding: 8px 10px;
  text-align: left;
}

.tool-pick-icon {
  grid-area: icon;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  color: var(--accent);
  border-radius: 5px;
  background: rgba(31, 107, 255, 0.08);
}

.tool-pick-card.active .tool-pick-icon {
  color: white;
  background: var(--accent);
}

.tool-pick-card > span:not(.tool-pick-icon) {
  font-size: 13px;
  font-weight: 650;
}

.tool-pick-card > span.tool-pick-icon {
  font-size: 0;
  font-weight: 400;
}

.tool-pick-card small {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-pick-card.active small {
  color: var(--accent);
}

.tool-picker-modal {
  width: min(1120px, 96vw);
}

.tool-picker-modal-body {
  padding: 16px 18px 20px;
}

.tool-picker-modal .tool-picker {
  gap: 10px;
}

.compact-tool-picker {
  grid-template-columns: 150px minmax(0, 1fr);
  align-items: start;
}

.tool-group-tabs {
  display: grid;
  gap: 8px;
}

.tool-group-tab {
  min-height: 52px;
  padding: 9px 10px;
  display: grid;
  gap: 3px;
  color: var(--fg-2);
  text-align: left;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--tint);
  transition: border-color 160ms, background 160ms, color 160ms, transform 160ms;
}

.tool-group-tab:hover,
.tool-group-tab.active {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-soft);
  transform: translateY(-1px);
}

.tool-group-tab strong {
  font-size: 13px;
}

.tool-group-tab small {
  color: var(--muted);
  font-size: 11px;
}

.tool-picker-modal .tool-picker-group {
  grid-template-columns: 104px minmax(0, 1fr);
  align-items: stretch;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.02)),
    var(--tint);
}

.tool-picker-modal .tool-picker-group-name {
  min-height: 100%;
  padding: 10px 8px;
  display: grid;
  align-content: center;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.045);
}

.tool-picker-modal .tool-grid {
  grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
  align-content: start;
}

.tool-picker-modal .tool-pick-card {
  min-height: 60px;
  padding: 8px 10px;
}

.tool-picker-modal .active-tool-group {
  min-height: 238px;
}

.tool-prompt-hint {
  margin: -2px 0 2px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.tool-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 22px;
  border-bottom: 1px solid var(--border);
  background: linear-gradient(90deg, var(--surface), transparent);
}

.tool-banner-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.tool-banner-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--fg);
}

.tool-banner-subtitle {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.4;
}

.tool-control {
  display: grid;
  gap: 6px;
}

.tool-tips {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 6px;
  color: var(--fg-2);
  font-size: 12px;
  line-height: 1.6;
}

.tool-tips li {
  list-style: disc;
}

.prompt-preview {
  min-height: 128px;
  width: 100%;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg);
  color: var(--fg-2);
  text-align: left;
  line-height: 1.6;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  transition: border-color 160ms, background 160ms, box-shadow 160ms;
}

.prompt-preview:hover {
  border-color: var(--border-glow);
  box-shadow: var(--focus-ring);
}

.retry-notice {
  margin-top: -4px;
  color: var(--accent);
  font-size: 12px;
}

.prompt-language-note {
  margin-top: -4px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}

.prompt-language-note.warn {
  color: var(--accent);
}

.upload-box {
  min-height: 92px;
  border: 2px dashed var(--border);
  border-radius: var(--radius-lg);
  display: grid;
  place-items: center;
  gap: 8px;
  color: var(--muted);
  cursor: pointer;
  background:
    radial-gradient(circle at 50% 0%, rgba(87, 166, 255, 0.12), transparent 38%),
    var(--tint);
  transition: border-color 160ms, color 160ms, background 160ms;
}

.upload-box:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.reference-preview {
  width: 100%;
  max-height: 160px;
  object-fit: cover;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

.reference-square {
  width: min(176px, 100%);
  aspect-ratio: 1;
  padding: 12px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  position: relative;
  overflow: hidden;
  color: var(--fg-2);
  text-align: center;
  cursor: pointer;
  border: 1px dashed var(--border);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(circle at 50% 10%, rgba(87, 166, 255, 0.16), transparent 42%),
    var(--tint);
  transition: transform 160ms, border-color 160ms, box-shadow 160ms, color 160ms;
}

.reference-square:hover {
  color: var(--accent);
  border-color: var(--accent);
  box-shadow: var(--focus-ring);
  transform: translateY(-1px);
}

.reference-square img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.reference-square img + strong,
.reference-square img ~ small {
  z-index: 1;
  padding: 4px 8px;
  color: #fff;
  border-radius: var(--radius-pill);
  background: rgba(7, 11, 20, 0.64);
  backdrop-filter: blur(8px);
}

.reference-square-icon {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  color: var(--accent);
  border-radius: 16px;
  background: var(--accent-soft);
}

.reference-square strong {
  font-size: 13px;
}

.reference-square small {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.35;
}

.mode-flow-block p {
  line-height: 1.65;
}

.chip-button {
  min-height: 36px;
  padding: 7px;
}

.three-d-reference-list {
  display: grid;
  gap: 10px;
}

.three-d-reference-card {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 8px;
  color: var(--fg-2);
  text-align: left;
  background: var(--tint);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.three-d-reference-card:hover {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: var(--accent);
}

.three-d-reference-card img {
  width: 76px;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-soft);
}

.three-d-reference-card span {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.three-d-reference-card strong,
.three-d-reference-card small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.three-d-reference-card strong {
  color: var(--fg);
  font-size: 13px;
}

.three-d-reference-card small {
  color: var(--muted);
  font-size: 11px;
}

.icon-size-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.icon-size-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--tint);
  padding: 10px 12px;
  display: grid;
  gap: 4px;
  text-align: left;
}

.icon-size-card strong {
  font-size: 13px;
  font-weight: 700;
}

.icon-size-card small {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.35;
}

.icon-size-card.active {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}

.field-note {
  margin-top: 6px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.route-info-card {
  padding: 11px 12px;
  display: grid;
  gap: 5px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--tint);
}

.route-info-card span {
  color: var(--muted);
  font-size: 12px;
}

.route-info-card strong {
  color: var(--accent);
  font-size: 13px;
  font-weight: 750;
}

.route-info-card small {
  color: var(--fg-2);
  font-size: 11px;
  line-height: 1.45;
}

.ico-size-checks {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.ico-size-check {
  min-height: 38px;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--tint);
  color: var(--fg-2);
}

.ico-size-check input[type="checkbox"] {
  flex: 0 0 auto;
}

.workspace-center {
  min-width: 0;
  display: grid;
  grid-template-rows: auto 1fr;
  align-content: start;
}

.result-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  background:
    linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.030)),
    var(--surface);
  box-shadow: var(--elev-raised);
  overflow: hidden;
  min-height: clamp(520px, 62vh, 760px);
  display: grid;
  grid-template-rows: auto 1fr auto;
}

.result-fold-card {
  margin: 18px 22px;
}

.result-fold-content {
  padding: 0 14px 14px;
}

.result-fold-card .result-card {
  margin: 0;
  min-height: clamp(430px, 56vh, 680px);
  grid-template-rows: 1fr auto;
}

.result-head,
.result-foot {
  padding: 14px 16px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.result-head {
  border-bottom: 1px solid var(--border-soft);
}

.stage {
  min-height: 430px;
  display: grid;
  place-items: center;
  padding: 18px;
  background:
    linear-gradient(rgba(255,255,255,.028) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.028) 1px, transparent 1px),
    radial-gradient(circle at 20% 10%, rgba(87, 166, 255, .16), transparent 30%),
    radial-gradient(circle at 80% 90%, rgba(46, 232, 200, .12), transparent 26%),
    rgba(255, 255, 255, .025);
  background-size: 28px 28px, 28px 28px, auto, auto, auto;
}

.samples {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.sample {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  overflow: hidden;
  text-align: left;
  transition: transform 160ms, border-color 160ms, box-shadow 160ms;
}

.sample:hover {
  transform: translateY(-2px);
  border-color: var(--border-glow);
  box-shadow: var(--card-hover-shadow);
}

.sample.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--border-glow);
}

.sample-media {
  position: relative;
  display: block;
  overflow: hidden;
  aspect-ratio: 4 / 3;
  background: var(--tint);
}

.sample-media img,
.sample-media video {
  width: 100%;
  height: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
}

.sample-media-gif::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 1;
  background:
    linear-gradient(90deg, transparent, var(--decor-sweep), transparent),
    repeating-linear-gradient(90deg, var(--decor-line) 0 1px, transparent 1px 18px);
  mix-blend-mode: var(--decor-blend);
  opacity: 0.72;
  animation: gifPreviewSweep 1.1s linear infinite;
  pointer-events: none;
}

.sample-media-gif img {
  animation: gifPreviewPulse 1.15s ease-in-out infinite alternate;
}

.sample-media-3d {
  perspective: 900px;
}

.sample-media-3d img {
  transform-origin: 50% 58%;
  animation: threeDPreviewTilt 4.2s ease-in-out infinite;
  filter: drop-shadow(0 12px 18px rgba(0, 0, 0, 0.12)) saturate(1.08);
}

.sample-media-3d::after {
  content: "";
  position: absolute;
  inset: 12% 8%;
  border: 1px solid var(--decor-border);
  transform: perspective(900px) rotateX(58deg) rotateZ(-8deg);
  box-shadow: 0 20px 36px rgba(0, 0, 0, 0.10);
  pointer-events: none;
}

.preview-badge {
  position: absolute;
  right: 10px;
  top: 10px;
  z-index: 2;
  padding: 4px 8px;
  color: var(--accent-on);
  background: linear-gradient(135deg, var(--accent), var(--accent-3));
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
}

.sample > span:not(.sample-media) {
  display: block;
  padding: 10px 12px;
  font-weight: 650;
}

.generating,
.empty-stage {
  display: grid;
  place-items: center;
  gap: 12px;
  text-align: center;
  color: var(--fg-2);
}

.error-stage {
  max-width: min(560px, 90%);
}

.error-stage strong,
.error-stage p {
  overflow-wrap: anywhere;
}

.error-stage strong {
  color: var(--danger);
}

.shimmer {
  width: min(540px, 70vw);
  height: 300px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: linear-gradient(110deg, var(--surface-2), var(--surface), var(--surface-2));
  background-size: 200% 100%;
  animation: shimmer 1.2s infinite;
}

.media-preview-shape {
  width: min(540px, 70vw);
  height: 300px;
  position: relative;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--tint-strong);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 18px 44px rgba(0,0,0,.12);
}

.media-preview-shape > strong {
  position: absolute;
  left: 18px;
  top: 16px;
  z-index: 4;
  padding: 5px 10px;
  border-radius: var(--radius-pill);
  background: rgba(255,255,255,.78);
  color: #0b1728;
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: .10em;
}

.media-preview-image {
  background:
    radial-gradient(circle at 76% 24%, rgba(246,196,83,.96) 0 18px, transparent 19px),
    linear-gradient(160deg, rgba(87,166,255,.24), rgba(46,232,200,.14)),
    var(--tint-strong);
}

.media-preview-image::before,
.media-preview-image::after,
.media-mountain {
  content: "";
  position: absolute;
  bottom: -62px;
  width: 280px;
  height: 190px;
  border-radius: 48px 48px 0 0;
  transform: rotate(18deg);
  background: linear-gradient(135deg, rgba(66,211,146,.92), rgba(46,232,200,.36));
}

.media-preview-image::before {
  left: -36px;
}

.media-preview-image::after {
  right: -28px;
  bottom: -72px;
  transform: rotate(-18deg);
  background: linear-gradient(135deg, rgba(87,166,255,.94), rgba(157,124,255,.34));
}

.media-sun,
.media-mountain,
.media-play,
.media-film-dots {
  display: none;
}

.media-preview-video {
  background:
    linear-gradient(90deg, rgba(255,255,255,.12) 0 28px, transparent 28px calc(100% - 28px), rgba(255,255,255,.12) calc(100% - 28px)),
    radial-gradient(circle at 50% 50%, rgba(157,124,255,.26), transparent 34%),
    linear-gradient(135deg, rgba(8,13,24,.96), rgba(22,36,62,.90));
}

.media-preview-video .media-play,
.media-preview-video .media-film-dots {
  display: block;
}

.media-play {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 82px;
  height: 82px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent), var(--accent-3));
  box-shadow: 0 18px 36px rgba(87,166,255,.34);
}

.media-play::after {
  content: "";
  position: absolute;
  left: 33px;
  top: 24px;
  border-left: 26px solid white;
  border-top: 17px solid transparent;
  border-bottom: 17px solid transparent;
}

.media-film-dots {
  position: absolute;
  inset: 28px 10px;
}

.media-film-dots i {
  position: absolute;
  left: 0;
  width: 8px;
  height: 8px;
  border-radius: 3px;
  background: rgba(255,255,255,.58);
  box-shadow: calc(min(540px, 70vw) - 28px) 0 0 rgba(255,255,255,.58);
}

.media-film-dots i:nth-child(1) { top: 0; }
.media-film-dots i:nth-child(2) { top: 72px; }
.media-film-dots i:nth-child(3) { top: 144px; }
.media-film-dots i:nth-child(4) { top: 216px; }

.mode-preview {
  width: min(540px, 70vw);
  height: 300px;
  display: grid;
  place-items: center;
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: linear-gradient(145deg, rgba(14, 184, 166, 0.20), rgba(87, 166, 255, 0.12)), var(--tint-strong);
}

.mode-preview-idle {
  width: min(420px, 70vw);
  height: 220px;
}

.mode-preview > strong {
  position: relative;
  z-index: 2;
  font-size: 44px;
  letter-spacing: 0.08em;
  color: var(--fg);
}

.mode-preview-gif {
  background: linear-gradient(145deg, rgba(20, 184, 166, 0.34), rgba(163, 230, 53, 0.18)), var(--tint-strong);
}

.gif-preview-strip {
  position: absolute;
  inset: 28px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.gif-preview-strip span {
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.20);
  border: 1px solid var(--border);
  animation: gifFramePop 1.2s ease-in-out infinite;
}

.gif-preview-strip span:nth-child(2) {
  animation-delay: 0.15s;
}

.gif-preview-strip span:nth-child(3) {
  animation-delay: 0.3s;
}

.gif-preview-strip span:nth-child(4) {
  animation-delay: 0.45s;
}

.mode-preview-3d {
  perspective: 900px;
  background: radial-gradient(circle at 40% 18%, rgba(249, 115, 22, 0.18), transparent 34%), var(--tint-strong);
}

.three-d-preview-scene {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  transform-style: preserve-3d;
}

.three-d-preview-cube {
  width: 118px;
  height: 118px;
  position: relative;
  transform-style: preserve-3d;
  animation: threeDSpin 3.8s ease-in-out infinite;
}

.three-d-preview-cube i,
.three-d-preview-cube::before,
.three-d-preview-cube::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 14px;
  background: var(--decor-glow);
  border: 1px solid var(--decor-border);
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.10);
}

.three-d-preview-cube::before {
  transform: translateZ(58px);
}

.three-d-preview-cube::after {
  transform: rotateY(90deg) translateZ(58px);
}

.three-d-preview-cube i {
  transform: rotateX(90deg) translateZ(58px);
}

@keyframes shimmer {
  to {
    background-position-x: -200%;
  }
}

@keyframes gifFramePop {
  0%, 100% {
    transform: translateY(16px) scale(0.92);
    opacity: 0.42;
  }
  45% {
    transform: translateY(0) scale(1);
    opacity: 0.94;
  }
}

@keyframes gifPreviewSweep {
  from {
    transform: translateX(-30%);
  }
  to {
    transform: translateX(30%);
  }
}

@keyframes gifPreviewPulse {
  from {
    transform: scale(1);
  }
  to {
    transform: scale(1.035);
  }
}

@keyframes threeDSpin {
  0%, 100% {
    transform: rotateX(-20deg) rotateY(-28deg);
  }
  50% {
    transform: rotateX(-12deg) rotateY(34deg);
  }
}

@keyframes threeDPreviewTilt {
  0%, 100% {
    transform: perspective(900px) rotateX(0deg) rotateY(-6deg) scale(1.01);
  }
  50% {
    transform: perspective(900px) rotateX(3deg) rotateY(7deg) scale(1.035);
  }
}

.result-foot {
  border-top: 1px solid var(--border-soft);
}

.param-two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.range-row {
  display: grid;
  grid-template-columns: 64px 1fr 36px;
  gap: 10px;
  align-items: center;
  color: var(--muted);
  font-size: 12px;
}

.range-row b {
  color: var(--fg);
  text-align: right;
  font-family: var(--font-mono);
}

.floating-generate-btn {
  position: fixed;
  right: 328px;
  bottom: 28px;
  z-index: 20;
  min-width: 142px;
  min-height: 46px;
  border-radius: 999px;
  box-shadow: 0 18px 42px rgba(87, 166, 255, 0.34), var(--elev-raised);
}

.floating-generate-btn:disabled {
  cursor: wait;
  opacity: 0.76;
  transform: none;
}

.prompt-modal {
  width: min(840px, 96vw);
}

.prompt-modal-body {
  padding: 18px 20px 20px;
}

.prompt-editor {
  min-height: clamp(280px, 48vh, 520px);
  width: 100%;
  padding: 14px 16px;
  line-height: 1.7;
  border-radius: 14px;
  resize: none;
  background: rgba(7, 11, 20, 0.72);
}

.library-modal {
  width: min(1120px, 96vw);
}

.library-modal-body {
  overflow: auto;
}

.prompt-list {
  display: grid;
  gap: 10px;
  align-content: start;
}

.prompt-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 4px;
  color: var(--muted);
  font-size: 12px;
}

.prompt-pagination .btn-row {
  flex: 0 0 auto;
}

.empty-prompt-library {
  padding: 28px 12px;
  color: var(--muted);
  text-align: center;
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
}

.library-grid {
  display: grid;
  grid-template-columns: minmax(208px, 248px) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.library-categories {
  display: grid;
  align-content: start;
  gap: 8px;
}

.category-button {
  width: 100%;
  min-height: 40px;
  padding: 9px 12px;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 10px;
  color: var(--fg-2);
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  line-height: 1.35;
  white-space: normal;
  overflow-wrap: anywhere;
}

.category-button :deep(svg) {
  flex: 0 0 auto;
  margin-top: 1px;
}

.category-label {
  min-width: 0;
}

.category-button.active {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: var(--accent);
}

.library-main {
  min-width: 0;
  display: grid;
  gap: 10px;
  align-content: start;
}

.library-toolbar {
  display: flex;
  align-items: center;
  min-width: 0;
}

.library-search {
  display: block;
  flex: 0 1 360px;
  width: 100% !important;
  max-width: 360px;
  min-width: 0;
  min-height: 40px;
}

.prompt-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--tint);
  min-width: 0;
}

.prompt-item-copy {
  min-width: 0;
}

.prompt-item-copy .inline {
  justify-content: flex-start;
  row-gap: 6px;
}

.prompt-item p {
  margin-top: 6px;
  color: var(--fg-2);
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-height: 1.5;
}

.prompt-zh {
  display: block;
  margin-top: 6px;
  color: var(--muted);
  line-height: 1.45;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.prompt-item-actions {
  display: grid;
  gap: 8px;
  justify-self: end;
}

.prompt-item-action {
  min-width: 60px;
  min-height: 30px;
  flex: 0 0 auto;
  white-space: nowrap;
}

.three-d-preview-modal {
  width: min(900px, 96vw);
}

.three-d-preview-body {
  display: grid;
  grid-template-columns: minmax(280px, 1.05fr) minmax(240px, 0.95fr);
  gap: 18px;
  align-items: start;
}

.three-d-preview-body > img {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

.prompt-box {
  padding: 13px 14px;
  color: var(--fg-2);
  line-height: 1.7;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--tint);
  overflow-wrap: anywhere;
}

@media (max-width: 1260px) {
  .workspace-grid {
    grid-template-columns: minmax(280px, 320px) minmax(0, 1fr);
  }

  .workspace-pane:last-child {
    display: block;
    grid-column: 1 / -1;
    border-left: 0;
    border-top: 1px solid var(--border);
    position: static;
    max-height: none;
    overflow: visible;
  }

  .workspace-center {
    min-height: auto;
  }

  .floating-generate-btn {
    right: 28px;
  }
}

@media (max-width: 1040px) {
  .result-head,
  .result-foot {
    align-items: flex-start;
    flex-direction: column;
  }

  .samples {
    grid-template-columns: 1fr;
  }

  .icon-size-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .ico-size-checks {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .library-grid {
    grid-template-columns: 1fr;
  }

  .library-categories {
    grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
  }

  .compact-tool-picker {
    grid-template-columns: 1fr;
  }

  .tool-group-tabs {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .tool-picker-modal .tool-picker-group {
    grid-template-columns: 88px minmax(0, 1fr);
  }

  .tool-picker-modal .tool-grid {
    grid-template-columns: repeat(auto-fit, minmax(136px, 1fr));
  }

  .three-d-preview-body {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 820px) {
  .workspace-grid {
    grid-template-columns: 1fr;
  }

  .workspace-pane {
    position: static;
    max-height: none;
    overflow: visible;
    border-right: 0 !important;
  }

  .workspace-pane:first-child {
    border-bottom: 1px solid var(--border);
  }

  .tool-grid,
  .chip-grid,
  .mode-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tool-summary-card {
    grid-template-columns: 34px minmax(0, 1fr);
  }

  .tool-summary-icon {
    width: 34px;
    height: 34px;
  }

  .tool-summary-meta {
    grid-column: 1 / -1;
    justify-self: start;
  }

  .tool-picker-modal-body {
    padding: 12px;
  }

  .workspace-fold-card {
    margin: 10px;
  }

  .workspace-fold-card > summary {
    grid-template-columns: minmax(0, 1fr) auto 16px;
  }

  .workspace-fold-card > summary b {
    max-width: 112px;
  }

  .tool-group-tabs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tool-picker-modal .tool-picker-group {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .tool-picker-modal .tool-picker-group-name {
    min-height: 0;
    padding: 8px 10px;
    grid-template-columns: 1fr auto;
    align-items: center;
  }

  .tool-picker-modal .tool-picker-group-name small {
    margin-top: 0;
  }

  .tool-picker-modal .tool-grid {
    grid-template-columns: repeat(auto-fit, minmax(136px, 1fr));
  }

  .result-fold-card .result-card {
    min-height: 440px;
    border-radius: var(--radius-lg);
  }

  .stage {
    min-height: 320px;
    padding: 14px;
  }

  .mode-preview,
  .shimmer {
    width: 100%;
    height: 220px;
  }

  .library-grid {
    grid-template-columns: 1fr;
  }

  .icon-size-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ico-size-checks {
    grid-template-columns: 1fr;
  }

  .prompt-modal,
  .library-modal {
    width: min(96vw, 720px);
  }

  .prompt-editor {
    min-height: 240px;
  }

  .library-search {
    flex-basis: 100%;
    max-width: none;
    width: 100% !important;
  }

  .library-categories {
    display: flex;
    overflow-x: auto;
    grid-template-columns: none;
  }

  .category-button {
    white-space: nowrap;
    width: auto;
    min-width: max-content;
    align-items: center;
    overflow-wrap: normal;
  }

  .prompt-pagination {
    align-items: stretch;
    flex-direction: column;
  }

  .prompt-pagination .btn-row {
    justify-content: space-between;
  }

  .floating-generate-btn {
    position: sticky;
    left: auto;
    right: auto;
    bottom: 14px;
    width: auto;
    min-width: 0;
    min-height: 48px;
    margin: 16px;
  }
}
</style>
