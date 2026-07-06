import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { isBlockedPromptCategory, mergePromptItems, normalizePromptImport, normalizePromptSync } from '@/domain/promptImport'
import { containsChineseText } from '@/domain/language'
import {
  defaultCoverPresets,
  defaultModels,
  defaultPrompts,
  modeAliases,
  modeLabels,
  stylePresets,
} from '@/data/catalog'
import { browserStorage } from '@/services/storage'
import { invokeOptional, isElectronRuntime } from '@/services/desktop'
import { createWebGenerationTask } from '@/services/webGeneration'
import {
  buildIcoFile,
  bytesToDataUrl,
  canvasToPngBytes,
  createIcoDataUrl,
  createCanvas,
  loadImageFromDataUrl,
  rasterizeDataUrl,
  type ExportAssetData,
} from '@/domain/canvas'
import { buildZipFile } from '@/domain/zip'
import type {
  AppSettings,
  CoverPreset,
  GeneratedAsset,
  GenerationInput,
  GenerationMode,
  GenerationTask,
  ExportFormat,
  ModelCatalogItem,
  ModelProfile,
  PromptItem,
  TextPolishInput,
  TextPolishResult,
  UserAccount,
  UserAccountRole,
} from '@/types/domain'
import { createId } from '@/domain/ids'

const STORAGE_KEY = 'samimage.v3.state'
const AUTH_STORAGE_KEY = 'gotbot.auth.v1'
const DEFAULT_ACCOUNT_ID = 'account-admin'
const fallbackGifDataUrl = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH/C05FVFNDQVBFMi4wAwEAAAAh+QQAFAAAACwAAAAAAQABAAACAkQBACH5BAAUAAAALAAAAAABAAEAAAICTAEAOw=='
const builtinDefaultModelIds = new Set([
  'text-polish',
  'agnes-image',
  'agnes-video',
  'openai-gpt-image-2',
  'platform-agnes-image',
  'platform-gogoing-text',
  'platform-gogoing-image',
  'platform-agnes-video',
])

interface PersistedState {
  models: ModelProfile[]
  prompts: PromptItem[]
  tasks: GenerationTask[]
  coverPresets: CoverPreset[]
  settings: AppSettings
  promptSync?: PromptSyncState
}

interface AuthState {
  accounts: UserAccount[]
  currentAccountId: string
  isAuthenticated: boolean
  accountSecrets: Record<string, string>
}

export interface ModelRouteGroup {
  key: string
  kind: ModelProfile['kind']
  model: string
  profiles: ModelProfile[]
}

interface PromptSyncState {
  glidea?: PromptSyncResult
  EvoLinkAI?: PromptSyncResult
  freestylefly?: PromptSyncResult
}

interface PromptSyncResult {
  at: string
  count: number
  url: string
}

interface PromptSyncSource {
  key: 'glidea' | 'EvoLinkAI' | 'freestylefly'
  label: string
  repo: string
  candidates: string[]
}

type CatalogModelKind = ModelCatalogItem['kind']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const POLISH_VOCAB = {
  character: [
    '面容精致', '眼神深邃', '目光温柔', '表情自然', '姿态优雅', '身姿挺拔',
    '长发飘逸', '短发干练', '发丝随风轻扬', '刘海微垂',
    '衣着考究', '服饰华丽', '衣袂飘飘', '穿着简约优雅', '身披轻纱',
    '肌肤细腻', '面容清秀', '轮廓分明', '气质温婉', '神态从容',
    '眉目如画', '唇红齿白', '面若桃花', '英气逼人', '温文尔雅',
  ],
  scene: [
    '古色古香的街道', '繁华都市街头', '静谧的湖畔', '郁郁葱葱的森林',
    '花开遍野的草原', '烟雨朦胧的山谷', '巍峨的雪山脚下', '碧海蓝天的海岸',
    '幽深的竹林', '灯火阑珊的小巷', '樱花纷飞的庭院', '秋叶铺满的小径',
    '白雪覆盖的屋顶', '潺潺流水的石桥', '藤蔓缠绕的废墟', '晨光中的田野',
    '暮色中的古堡', '薄雾笼罩的湖面', '阳光斑驳的窗台', '微风拂过的麦浪',
    '潺潺溪流旁', '苍翠山峦间', '繁华夜市里', '空旷沙漠中',
  ],
  color: [
    '暖色调', '冷色调', '金色光辉', '银白月光', '柔和渐变色彩',
    '高对比色彩', '低饱和度', '鲜艳明快', '淡雅清新', '复古色调',
    '琥珀色光芒', '翡翠绿', '宝石蓝', '玫瑰金', '紫罗兰色',
    '晨曦微光', '暮色昏黄', '霓虹闪烁', '体积光效果', '逆光剪影',
    '丁达尔光线', '暖黄灯光', '冷蓝阴影', '橙红晚霞映照',
  ],
  sky: [
    '湛蓝天空', '万里无云', '白云悠悠', '晚霞映天', '火烧云',
    '朝霞绚烂', '星河璀璨', '银河横跨天际', '繁星点点', '流星划过',
    '彩虹横跨', '极光漫舞', '月光如水', '月晕朦胧', '乌云翻涌',
    '薄雾轻笼', '金色阳光洒落', '夕阳西下', '旭日东升', '天空呈渐变色彩',
    '云层间透出光束', '暮色四合', '黎明破晓', '皓月当空',
  ],
}

function pickRandomItems<T>(arr: readonly T[], count: number): T[] {
  const copy = arr.slice()
  const result: T[] = []
  for (let i = 0; i < count && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length)
    result.push(copy.splice(idx, 1)[0])
  }
  return result
}

function randomPolishDetails(count: number): string[] {
  return [
    ...pickRandomItems(POLISH_VOCAB.character, count),
    ...pickRandomItems(POLISH_VOCAB.scene, count),
    ...pickRandomItems(POLISH_VOCAB.color, count),
    ...pickRandomItems(POLISH_VOCAB.sky, count),
  ]
}

const accountAvatarColors = ['#111827', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#059669']

function accountStateKey(accountId: string): string {
  return `gotbot.account.${accountId}.state`
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function createDefaultAccount(): UserAccount {
  const now = new Date().toISOString()
  return {
    id: DEFAULT_ACCOUNT_ID,
    username: 'admin',
    displayName: '管理员',
    role: 'admin',
    isActive: true,
    avatarColor: accountAvatarColors[0],
    createdAt: now,
    lastActiveAt: now,
  }
}

function normalizeAccount(value: unknown, index: number): UserAccount | null {
  if (!isRecord(value)) return null
  const username = typeof value.username === 'string' ? value.username.trim() : ''
  const email = typeof value.email === 'string' ? normalizeEmail(value.email) : ''
  const displayName = typeof value.displayName === 'string' ? value.displayName.trim() : ''
  if (!username && !displayName && !email) return null
  const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : createId('account')
  const now = new Date().toISOString()
  const role: UserAccountRole = value.role === 'admin' ? 'admin' : 'user'
  return {
    id,
    username: username || email || `user-${index + 1}`,
    email: email || undefined,
    displayName: displayName || username || email || `用户 ${index + 1}`,
    role,
    isActive: value.isActive !== false,
    avatarColor: typeof value.avatarColor === 'string' && value.avatarColor.trim()
      ? value.avatarColor
      : accountAvatarColors[index % accountAvatarColors.length],
    createdAt: typeof value.createdAt === 'string' && value.createdAt ? value.createdAt : now,
    lastActiveAt: typeof value.lastActiveAt === 'string' && value.lastActiveAt ? value.lastActiveAt : now,
  }
}

function normalizeAuthState(value: unknown): AuthState {
  const rawAccounts = isRecord(value) && Array.isArray(value.accounts) ? value.accounts : []
  let accounts = rawAccounts
    .map((account, index) => normalizeAccount(account, index))
    .filter((account): account is UserAccount => Boolean(account))

  if (!accounts.length) accounts = [createDefaultAccount()]
  if (!accounts.some((account) => account.role === 'admin')) {
    accounts = accounts.map((account, index) => index === 0 ? { ...account, role: 'admin' } : account)
  }
  if (!accounts.some((account) => account.isActive)) {
    accounts = accounts.map((account, index) => index === 0 ? { ...account, isActive: true } : account)
  }

  const requestedCurrentId = isRecord(value) && typeof value.currentAccountId === 'string' ? value.currentAccountId : ''
  const isAuthenticated = isRecord(value) ? value.isAuthenticated === true : false
  const currentAccount = accounts.find((account) => account.id === requestedCurrentId && account.isActive)
    ?? accounts.find((account) => account.isActive)
    ?? accounts[0]

  const rawSecrets = isRecord(value) && isRecord(value.accountSecrets) ? value.accountSecrets : {}
  const accountSecrets = accounts.reduce<Record<string, string>>((result, account) => {
    const storedSecret = rawSecrets[account.id]
    result[account.id] = typeof storedSecret === 'string' && storedSecret ? storedSecret : (account.username === 'admin' ? 'admin123' : 'gotbot123')
    return result
  }, {})

  return {
    accounts,
    currentAccountId: currentAccount.id,
    isAuthenticated,
    accountSecrets,
  }
}

function modelCatalogEndpoint(baseUrl: string): string {
  const url = new URL(baseUrl.trim())
  const segments = url.pathname.split('/').filter(Boolean)
  const v1Index = segments.lastIndexOf('v1')
  const prefix = v1Index >= 0 ? segments.slice(0, v1Index) : segments
  url.pathname = `/${[...prefix, 'v1', 'models'].join('/')}`
  url.search = ''
  return url.toString()
}

function inferCatalogModelKind(modelId: string): CatalogModelKind {
  const id = modelId.toLowerCase()
  if (['video', 'txt2video', 'img2video', 'wan', 'kling', 'veo'].some((marker) => id.includes(marker))) {
    return 'video'
  }
  if ([
    'tts',
    'speech',
    'audio',
    'voice',
    'eleven',
    'kokoro',
    'bark',
    'tortoise',
    'cosyvoice',
    'melo',
    'f5-tts',
    'xtts',
    'silero',
    'edge-tts',
    'azure-speech',
  ].some((marker) => id.includes(marker))) {
    return 'tts'
  }
  if ([
    'image',
    'dall-e',
    'dalle',
    'flux',
    'stable-diffusion',
    'sdxl',
    'ideogram',
    'recraft',
    'midjourney',
    'kolors',
  ].some((marker) => id.includes(marker))) {
    return 'image'
  }
  if (['gpt', 'chat', 'claude', 'deepseek', 'qwen', 'llama', 'gemini', 'moonshot', 'glm', 'mistral', 'yi-', 'agnes'].some((marker) => id.includes(marker))) {
    return 'text'
  }
  return 'unknown'
}

function catalogPayloadItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (!isRecord(payload)) return []
  if (Array.isArray(payload.data)) return payload.data
  if (Array.isArray(payload.models)) return payload.models
  if (Array.isArray(payload.items)) return payload.items
  return []
}

function catalogModelId(item: unknown): string {
  if (typeof item === 'string') return item.trim()
  if (!isRecord(item)) return ''
  const value = item.id ?? item.name ?? item.model ?? item.model_name
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeModelCatalog(payload: unknown): ModelCatalogItem[] {
  return catalogPayloadItems(payload)
    .map(catalogModelId)
    .filter((id, index, items) => id.length > 0 && items.indexOf(id) === index)
    .map((id) => ({
      id,
      name: id,
      kind: inferCatalogModelKind(id),
      source: 'remote' as const,
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
}

async function fetchModelCatalogViaProxy(profile: ModelProfile): Promise<ModelCatalogItem[] | null> {
  if (typeof window === 'undefined') return null

  let response: Response
  try {
    response = await fetch('/api/model-catalog', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        endpoint: profile.endpoint.trim(),
        apiKey: profile.apiKey.trim(),
      }),
    })
  } catch {
    return null
  }

  if (response.status === 404 || response.status === 405) return null
  if (!response.ok) {
    let message = `模型列表获取失败: HTTP ${response.status}`
    try {
      const payload = await response.json()
      if (isRecord(payload) && typeof payload.error === 'string') message = payload.error
    } catch {
      message = `模型列表获取失败: HTTP ${response.status}`
    }
    throw new Error(message)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch (error) {
    throw new Error(`解析模型列表失败: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }

  return normalizeModelCatalog(payload)
}

async function fetchModelCatalogOverHttp(profile: ModelProfile): Promise<ModelCatalogItem[]> {
  if (profile.provider !== 'openai-compatible') throw new Error('仅支持 OpenAI Compatible 模型列表接口')
  if (!profile.endpoint.trim()) throw new Error('请填写 API 地址')
  if (!profile.apiKey.trim()) throw new Error('请填写 API Key')
  if (typeof fetch !== 'function') throw new Error('当前运行环境不支持浏览器直连模型接口')

  const proxyResult = await fetchModelCatalogViaProxy(profile)
  if (proxyResult) return proxyResult

  let endpoint: string
  try {
    endpoint = modelCatalogEndpoint(profile.endpoint)
  } catch (error) {
    throw new Error(`API 地址格式不正确: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }

  let response: Response
  try {
    response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${profile.apiKey.trim()}`,
      },
    })
  } catch {
    throw new Error('浏览器直连模型接口失败，可能被 CORS 或网络策略拦截；请确认上游允许网页请求，或在桌面应用中检测')
  }

  if (!response.ok) {
    throw new Error(`模型列表获取失败: HTTP ${response.status}`)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch (error) {
    throw new Error(`解析模型列表失败: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }

  return normalizeModelCatalog(payload)
}

const defaultState: PersistedState = {
  models: defaultModels,
  prompts: defaultPrompts,
  tasks: [],
  coverPresets: defaultCoverPresets,
  settings: {
    defaultOutputDir: typeof navigator !== 'undefined' && /win/i.test(navigator.userAgent) ? 'D:\\gotbot\\exports' : '~/gotbot/exports',
    defaultExportFormat: 'svg',
    defaultImageModelId: '',
    defaultGenerationSize: 1024,
    defaultBatchSize: 4,
    defaultStyle: '自然',
    autoSaveHistory: true,
    includePromptMetadata: true,
  },
}

const promptSyncSources: PromptSyncSource[] = [
  {
    key: 'glidea',
    label: 'Glide',
    repo: 'glidea/banana-prompt-quicker',
    candidates: [
      'https://raw.githubusercontent.com/glidea/banana-prompt-quicker/main/prompts.json',
      'https://raw.githubusercontent.com/glidea/banana-prompt-quicker/master/prompts.json',
      'https://raw.githubusercontent.com/glidea/banana-prompt-quicker/main/public/prompts.json',
      'https://raw.githubusercontent.com/glidea/banana-prompt-quicker/main/data/prompts.json',
    ],
  },
  {
    key: 'EvoLinkAI',
    label: 'EvoLinkAI',
    repo: 'EvoLinkAI/awesome-gpt-image-2-API-and-Prompts',
    candidates: [
      'https://raw.githubusercontent.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts/main/prompts.json',
      'https://raw.githubusercontent.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts/master/prompts.json',
      'https://raw.githubusercontent.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts/main/README.md',
      'https://raw.githubusercontent.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts/master/README.md',
    ],
  },
  {
    key: 'freestylefly',
    label: 'Freestylefly',
    repo: 'freestylefly/awesome-gpt-image-2',
    candidates: [
      'https://raw.githubusercontent.com/freestylefly/awesome-gpt-image-2/main/prompts.json',
      'https://raw.githubusercontent.com/freestylefly/awesome-gpt-image-2/master/prompts.json',
      'https://raw.githubusercontent.com/freestylefly/awesome-gpt-image-2/main/README.md',
      'https://raw.githubusercontent.com/freestylefly/awesome-gpt-image-2/master/README.md',
    ],
  },
]

function cloneDefault(): PersistedState {
  return JSON.parse(JSON.stringify(defaultState)) as PersistedState
}

function cloneDefaultCoverPresets(): CoverPreset[] {
  return JSON.parse(JSON.stringify(defaultCoverPresets)) as CoverPreset[]
}

function normalizeDefaultExportFormat(value: unknown): ExportFormat {
  return value === 'png' || value === 'jpg' || value === 'webp' || value === 'svg' || value === 'mp4' || value === 'gif' || value === 'ico' ? value : 'svg'
}

function normalizeInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

function normalizeStyle(value: unknown): string {
  return typeof value === 'string' && stylePresets.includes(value) ? value : '自然'
}

function normalizeDefaultImageModelId(value: unknown, modelList: ModelProfile[]): string {
  const imageModels = modelList.filter((model) => model.kind === 'image' && model.provider !== 'local-preview' && model.id !== 'local-preview')
  if (typeof value === 'string' && imageModels.some((model) => model.id === value)) return value
  return imageModels.find((model) => model.isPrimary)?.id ?? imageModels[0]?.id ?? ''
}

function defaultModelApiPath(kind: ModelProfile['kind']): string {
  if (kind === 'text') return 'v1/chat/completions'
  if (kind === 'video') return 'v1/videos'
  if (kind === 'tts') return 'v1/audio/speech'
  return 'v1/images/generations'
}

function defaultModelApiProtocol(kind: ModelProfile['kind']): NonNullable<ModelProfile['apiProtocol']> {
  if (kind === 'text') return 'openai-chat'
  if (kind === 'video') return 'agnes-video'
  if (kind === 'tts') return 'openai-audio-speech'
  return 'openai-images'
}

function splitLegacyEndpoint(endpoint: string, kind: ModelProfile['kind']): Pick<ModelProfile, 'endpoint' | 'apiPath'> {
  const fallback = {
    endpoint: endpoint.trim(),
    apiPath: defaultModelApiPath(kind),
  }
  if (!endpoint.trim()) return fallback

  try {
    const url = new URL(endpoint.trim())
    const segments = url.pathname.split('/').filter(Boolean)
    const openapiIndex = segments.findIndex((segment, index) => segment === 'openapi' && segments[index + 1] === 'v1' && segments[index + 2] === 'storyboard')
    if (openapiIndex >= 0) {
      const apiPath = segments.slice(openapiIndex).join('/')
      const baseSegments = segments.slice(0, openapiIndex)
      url.pathname = baseSegments.length ? `/${baseSegments.join('/')}` : '/'
      url.search = ''
      return {
        endpoint: url.toString().replace(/\/$/, ''),
        apiPath,
      }
    }

    const v1Index = segments.lastIndexOf('v1')
    if (v1Index < 0) {
      url.search = ''
      return { ...fallback, endpoint: url.toString().replace(/\/$/, '') }
    }

    const apiPath = segments.slice(v1Index).join('/')
    const baseSegments = segments.slice(0, v1Index)
    url.pathname = baseSegments.length ? `/${baseSegments.join('/')}` : '/'
    url.search = ''
    return {
      endpoint: url.toString().replace(/\/$/, ''),
      apiPath: apiPath || defaultModelApiPath(kind),
    }
  } catch {
    return fallback
  }
}

function normalizeModelProfile(model: ModelProfile): ModelProfile {
  const apiProtocol = model.apiProtocol ?? defaultModelApiProtocol(model.kind)
  if (typeof model.apiPath === 'string') {
    const split = splitLegacyEndpoint(model.endpoint, model.kind)
    return {
      ...model,
      endpoint: split.endpoint,
      apiPath: model.apiPath.trim().replace(/^\/+|\/+$/g, ''),
      apiProtocol,
    }
  }

  return {
    ...model,
    ...splitLegacyEndpoint(model.endpoint, model.kind),
    apiProtocol,
  }
}

function modelRouteKey(model: ModelProfile): string {
  const modelId = model.model.trim().toLowerCase()
  return modelId ? `${model.kind}:${modelId}` : `${model.kind}:profile:${model.id}`
}

function normalizedModelEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/g, '').toLowerCase()
}

function routeProfileRank(model: ModelProfile, selectedId?: string): number {
  if (selectedId && model.id === selectedId) return 0
  if (model.isPrimary) return 1
  if (model.status === 'connected') return 2
  if (model.status === 'untested') return 3
  return 4
}

function sortRouteProfiles(profiles: ModelProfile[], selectedId?: string): ModelProfile[] {
  return profiles.slice().sort((left, right) => {
    const rankDiff = routeProfileRank(left, selectedId) - routeProfileRank(right, selectedId)
    if (rankDiff !== 0) return rankDiff
    return left.name.localeCompare(right.name)
  })
}

function textPolishSuccessMessage(task: TextPolishInput['task'], modelName: string): string {
  if (task === 'translate-to-english') return `已使用 ${modelName} 翻译为英文提示词`
  if (task === 'video-prompt') return `已使用 ${modelName} 润色视频提示词`
  if (task === 'negative-prompt') return `已使用 ${modelName} 润色反向提示词`
  return `已使用 ${modelName} 润色提示词`
}

function normalizeModelList(modelList: ModelProfile[]): ModelProfile[] {
  const visibleModels = modelList.filter((model) => model.provider !== 'local-preview' && model.id !== 'local-preview' && !builtinDefaultModelIds.has(model.id))
  const mergedModels = visibleModels.length ? visibleModels : defaultModels
  const existingIds = new Set(mergedModels.map((model) => model.id))
  return [
    ...mergedModels,
    ...defaultModels.filter((model) => !existingIds.has(model.id)),
  ].map(normalizeModelProfile)
}

function normalizePromptList(promptList?: PromptItem[]): PromptItem[] {
  const customPrompts = (promptList ?? []).filter((item) => {
    if (item.source === 'builtin') return false
    return ![item.category, item.subCategory, ...(item.tags ?? [])].some((value) => isBlockedPromptCategory(value))
  })
  return mergePromptItems(defaultPrompts, customPrompts)
}

function normalizeDefaultOutputDir(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return defaultState.settings.defaultOutputDir
  return value.replace(/samimage/gi, 'gotbot')
}

function compactBrowserState(state: PersistedState): PersistedState {
  return {
    ...state,
    tasks: (state.tasks ?? []).map((task) => ({
      ...task,
      assets: task.assets.map((asset) => ({
        ...asset,
        dataUrl: '',
      })),
    })),
  }
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error || fallback
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    const message = record.message ?? record.error
    if (typeof message === 'string' && message.trim()) return message
    try {
      return JSON.stringify(error)
    } catch {
      return fallback
    }
  }
  return fallback
}

function createGenerationErrorDetails(
  input: GenerationInput,
  error: unknown,
  model?: ModelProfile,
): Record<string, string | number | boolean | null> {
  const details: Record<string, string | number | boolean | null> = {
    errorMessage: errorMessage(error, '生成失败'),
    mode: input.mode,
    width: input.width,
    height: input.height,
    batchSize: input.batchSize,
    steps: input.steps,
    seed: input.seed,
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    if (typeof record.kind === 'string') details.errorKind = record.kind
    if (typeof record.code === 'string' || typeof record.code === 'number') details.errorCode = record.code
  }

  if (model) {
    details.modelName = model.name
    details.modelId = model.id
    details.model = model.model
    details.provider = model.provider
    details.endpoint = model.endpoint
    details.apiPath = model.apiPath ?? null
    details.apiProtocol = model.apiProtocol ?? null
    details.apiSecret = model.apiSecret?.trim() ? '已填写' : null
    details.modelStatus = model.status
  } else {
    details.modelId = input.modelId || null
  }

  return details
}

function createFailedGenerationTask(input: GenerationInput, error: unknown, model?: ModelProfile): GenerationTask {
  return {
    id: createId('task'),
    mode: input.mode,
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    modelId: input.modelId,
    width: input.width,
    height: input.height,
    batchSize: input.batchSize,
    steps: input.steps,
    seed: input.seed,
    style: input.style,
    modeOptions: input.modeOptions,
    status: 'failed',
    error: errorMessage(error, '生成失败'),
    errorDetails: createGenerationErrorDetails(input, error, model),
    isFavorite: false,
    assets: [],
    createdAt: new Date().toISOString(),
  }
}

export const useAppStore = defineStore('app', () => {
  const initialAuth = normalizeAuthState(browserStorage.read<AuthState>(AUTH_STORAGE_KEY, {
    accounts: [createDefaultAccount()],
    currentAccountId: DEFAULT_ACCOUNT_ID,
    isAuthenticated: false,
    accountSecrets: { [DEFAULT_ACCOUNT_ID]: 'admin123' },
  }))
  const legacyInitialState = browserStorage.read<PersistedState>(STORAGE_KEY, cloneDefault())
  const initial = compactBrowserState(browserStorage.read<PersistedState>(accountStateKey(initialAuth.currentAccountId), legacyInitialState))
  const initialModels = normalizeModelList(initial.models.length ? initial.models : defaultModels)
  const initialSettings = { ...defaultState.settings, ...initial.settings }
  initialSettings.defaultOutputDir = normalizeDefaultOutputDir(initialSettings.defaultOutputDir)
  initialSettings.defaultExportFormat = normalizeDefaultExportFormat(initialSettings.defaultExportFormat)
  initialSettings.defaultImageModelId = normalizeDefaultImageModelId(initialSettings.defaultImageModelId, initialModels)
  initialSettings.defaultGenerationSize = normalizeInteger(initialSettings.defaultGenerationSize, defaultState.settings.defaultGenerationSize, 128, 4096)
  initialSettings.defaultBatchSize = normalizeInteger(initialSettings.defaultBatchSize, defaultState.settings.defaultBatchSize, 1, 4)
  initialSettings.defaultStyle = normalizeStyle(initialSettings.defaultStyle)
  const models = ref<ModelProfile[]>(initialModels)
  const prompts = ref<PromptItem[]>(normalizePromptList(initial.prompts))
  const tasks = ref<GenerationTask[]>(initial.tasks)
  const coverPresets = ref<CoverPreset[]>(initial.coverPresets.length ? initial.coverPresets : cloneDefaultCoverPresets())
  const promptSync = ref<PromptSyncState>(initial.promptSync ?? {})
  const settings = ref<AppSettings>(initialSettings)
  const accounts = ref<UserAccount[]>(initialAuth.accounts)
  const currentAccountId = ref(initialAuth.currentAccountId)
  const isAuthenticated = ref(initialAuth.isAuthenticated)
  const accountSecrets = ref<Record<string, string>>(initialAuth.accountSecrets)
  const toast = ref<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  const activePrompt = ref('')
  const activeMode = ref<GenerationMode>('txt2img')

  const imageModels = computed(() => models.value.filter((model) => model.kind === 'image'))
  const textModels = computed(() => models.value.filter((model) => model.kind === 'text'))
  const ttsModels = computed(() => models.value.filter((model) => model.kind === 'tts'))
  const videoModels = computed(() => models.value.filter((model) => model.kind === 'video'))
  const primaryImageModel = computed(() => imageModels.value.find((model) => model.isPrimary) ?? imageModels.value[0])
  const primaryTextModel = computed(() => textModels.value.find((model) => model.isPrimary) ?? textModels.value[0])
  const primaryVideoModel = computed(() => videoModels.value.find((model) => model.isPrimary) ?? videoModels.value[0])
  const defaultImageModel = computed(() => imageModels.value.find((model) => model.id === settings.value.defaultImageModelId) ?? primaryImageModel.value)
  const textAutoRouteProfiles = computed(() => textRouteCandidates())
  const activeAccounts = computed(() => accounts.value.filter((account) => account.isActive))
  const currentAccount = computed(() => accounts.value.find((account) => account.id === currentAccountId.value) ?? activeAccounts.value[0] ?? accounts.value[0])
  const currentAccountIsAdmin = computed(() => currentAccount.value?.role === 'admin')
  const modelRouteGroups = computed<ModelRouteGroup[]>(() => {
    const groups = new Map<string, ModelRouteGroup>()
    for (const model of models.value) {
      if (model.provider === 'local-preview' || !model.model.trim()) continue
      const key = modelRouteKey(model)
      const existing = groups.get(key)
      if (existing) {
        existing.profiles.push(model)
      } else {
        groups.set(key, {
          key,
          kind: model.kind,
          model: model.model.trim(),
          profiles: [model],
        })
      }
    }
    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        profiles: sortRouteProfiles(group.profiles),
      }))
      .sort((left, right) => {
        const kindDiff = left.kind.localeCompare(right.kind)
        if (kindDiff !== 0) return kindDiff
        return left.model.localeCompare(right.model)
      })
  })
  const enabledCoverPresets = computed(() => coverPresets.value.filter((preset) => preset.enabled))
  const recentTasks = computed(() => tasks.value.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8))
  const operationTasks = computed(() => tasks.value.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
  const historyTasks = computed(() => operationTasks.value.filter((task) => task.status === 'completed' && task.assets.length > 0))
  const historyAssetCount = computed(() => historyTasks.value.reduce((sum, task) => sum + task.assets.length, 0))
  const allAssets = computed(() => tasks.value.flatMap((task) => task.assets.map((asset) => ({ task, asset }))))
  const completedAssets = computed(() => allAssets.value.filter(({ task }) => task.status === 'completed'))
  const favoriteTasks = computed(() => tasks.value.filter((task) => task.isFavorite))
  const favoriteAssets = computed(() =>
    tasks.value
      .flatMap((task) => task.assets)
      .filter((asset) => asset.isFavorite),
  )

  function snapshotState(): PersistedState {
    return {
      models: models.value,
      prompts: prompts.value,
      tasks: tasks.value,
      coverPresets: coverPresets.value,
      promptSync: promptSync.value,
      settings: settings.value,
    }
  }

  function snapshotBrowserState(): PersistedState {
    return compactBrowserState(snapshotState())
  }

  function applyPersistedState(next: PersistedState): void {
    const nextModels = normalizeModelList(next.models?.length ? next.models : defaultModels)
    const nextSettings = { ...defaultState.settings, ...next.settings }
    nextSettings.defaultOutputDir = normalizeDefaultOutputDir(nextSettings.defaultOutputDir)
    nextSettings.defaultExportFormat = normalizeDefaultExportFormat(nextSettings.defaultExportFormat)
    nextSettings.defaultImageModelId = normalizeDefaultImageModelId(nextSettings.defaultImageModelId, nextModels)
    nextSettings.defaultGenerationSize = normalizeInteger(nextSettings.defaultGenerationSize, defaultState.settings.defaultGenerationSize, 128, 4096)
    nextSettings.defaultBatchSize = normalizeInteger(nextSettings.defaultBatchSize, defaultState.settings.defaultBatchSize, 1, 4)
    nextSettings.defaultStyle = normalizeStyle(nextSettings.defaultStyle)

    models.value = nextModels
    prompts.value = normalizePromptList(next.prompts)
    tasks.value = next.tasks ?? []
    coverPresets.value = next.coverPresets?.length ? next.coverPresets : cloneDefaultCoverPresets()
    promptSync.value = next.promptSync ?? {}
    settings.value = nextSettings
  }

  function persist(): void {
    const snapshot = snapshotState()
    persistBrowserState(snapshotBrowserState())
    if (isElectronRuntime()) {
      void invokeOptional('save_app_state', { value: snapshot }).catch((error: unknown) => {
        console.warn('Failed to persist app state to Electron', error)
      })
    }
  }

  function persistBrowserState(snapshot: PersistedState): void {
    try {
      browserStorage.write(accountStateKey(currentAccountId.value), snapshot)
      browserStorage.write(STORAGE_KEY, snapshot)
    } catch (error) {
      console.warn('Failed to persist compact app state to browser storage; retrying after clearing legacy state', error)
      try {
        localStorage.removeItem(STORAGE_KEY)
        localStorage.removeItem(accountStateKey(currentAccountId.value))
        browserStorage.write(accountStateKey(currentAccountId.value), snapshot)
        browserStorage.write(STORAGE_KEY, snapshot)
      } catch (retryError) {
        console.warn('Failed to persist compact app state to browser storage after clearing legacy state', retryError)
      }
    }
  }

  function persistAuthState(): void {
    browserStorage.write(AUTH_STORAGE_KEY, {
      accounts: accounts.value,
      currentAccountId: currentAccountId.value,
      isAuthenticated: isAuthenticated.value,
      accountSecrets: accountSecrets.value,
    })
  }

  function readAccountState(accountId: string): PersistedState {
    return compactBrowserState(browserStorage.read<PersistedState>(accountStateKey(accountId), cloneDefault()))
  }

  function notify(message: string, type: 'success' | 'error' | 'info' = 'success'): void {
    if (toastTimer) clearTimeout(toastTimer)
    toast.value = { message, type }
    toastTimer = setTimeout(() => {
      toast.value = null
      toastTimer = undefined
    }, 2400)
  }

  function saveCurrentAccountWorkspace(): void {
    persistBrowserState(snapshotBrowserState())
  }

  function createAccount(input: { username: string; email?: string; displayName?: string; role?: UserAccountRole; isActive?: boolean; accessKey?: string }): UserAccount | null {
    const email = input.email ? normalizeEmail(input.email) : ''
    const username = input.username.trim() || email
    const displayName = input.displayName?.trim() || username
    const accessKey = input.accessKey?.trim() || 'gotbot123'
    if (!username) {
      notify('请输入账号名称', 'error')
      return null
    }
    if (email && !isValidEmail(email)) {
      notify('请输入有效邮箱地址', 'error')
      return null
    }
    if (accessKey.length < 6) {
      notify('访问密钥至少 6 个字符', 'error')
      return null
    }
    if (accounts.value.some((account) => account.username.toLowerCase() === username.toLowerCase())) {
      notify('账号名称已存在', 'error')
      return null
    }
    if (email && accounts.value.some((account) => account.email?.toLowerCase() === email)) {
      notify('邮箱已注册', 'error')
      return null
    }

    const now = new Date().toISOString()
    const account: UserAccount = {
      id: createId('account'),
      username,
      email: email || undefined,
      displayName,
      role: input.role ?? 'user',
      isActive: input.isActive ?? true,
      avatarColor: accountAvatarColors[accounts.value.length % accountAvatarColors.length],
      createdAt: now,
      lastActiveAt: now,
    }
    accounts.value = [...accounts.value, account]
    accountSecrets.value = { ...accountSecrets.value, [account.id]: accessKey }
    browserStorage.write(accountStateKey(account.id), compactBrowserState(cloneDefault()))
    persistAuthState()
    notify(`已创建账号：${displayName}`)
    return account
  }

  function findAccountByIdentifier(identifier: string): UserAccount | undefined {
    const keyword = normalizeEmail(identifier)
    if (!keyword) return undefined
    return activeAccounts.value.find((account) => {
      return account.username.toLowerCase() === keyword || account.email?.toLowerCase() === keyword
    })
  }

  function loginAccount(id: string, accessKey: string): boolean {
    const target = accounts.value.find((account) => account.id === id && account.isActive)
    if (!target) {
      notify('账号不存在或已停用', 'error')
      return false
    }
    if ((accountSecrets.value[id] ?? '').trim() !== accessKey.trim()) {
      notify('访问密钥不正确', 'error')
      return false
    }

    if (target.id !== currentAccountId.value) {
      saveCurrentAccountWorkspace()
      currentAccountId.value = target.id
      applyPersistedState(readAccountState(target.id))
    }
    accounts.value = accounts.value.map((account) => account.id === target.id
      ? { ...account, lastActiveAt: new Date().toISOString() }
      : account)
    isAuthenticated.value = true
    persistAuthState()
    persistBrowserState(snapshotBrowserState())
    notify(`欢迎回来，${target.displayName}`)
    return true
  }

  function loginAccountByIdentifier(identifier: string, accessKey: string): boolean {
    const target = findAccountByIdentifier(identifier)
    if (!target) {
      notify('账号不存在或已停用', 'error')
      return false
    }
    return loginAccount(target.id, accessKey)
  }

  function logout(): void {
    saveCurrentAccountWorkspace()
    isAuthenticated.value = false
    persistAuthState()
    notify('已退出登录', 'info')
  }

  function updateAccount(id: string, patch: Partial<Pick<UserAccount, 'displayName' | 'role' | 'isActive' | 'avatarColor'>>): boolean {
    const target = accounts.value.find((account) => account.id === id)
    if (!target) return false
    const nextRole = patch.role ?? target.role
    const nextIsActive = patch.isActive ?? target.isActive
    const activeAccountCount = accounts.value.filter((account) => account.isActive).length
    const adminAccountCount = accounts.value.filter((account) => account.role === 'admin').length
    if (target.role === 'admin' && nextRole !== 'admin' && adminAccountCount <= 1) {
      notify('至少保留一个管理员账号', 'error')
      return false
    }
    if (target.isActive && !nextIsActive && activeAccountCount <= 1) {
      notify('至少保留一个可用账号', 'error')
      return false
    }
    if (target.id === currentAccountId.value && !nextIsActive) {
      notify('不能停用当前账号，请先切换到其他账号', 'error')
      return false
    }

    accounts.value = accounts.value.map((account) => account.id === id
      ? {
          ...account,
          ...patch,
          displayName: patch.displayName?.trim() || account.displayName,
          role: nextRole,
          isActive: nextIsActive,
        }
      : account)
    persistAuthState()
    notify('账号信息已更新')
    return true
  }

  function switchAccount(id: string): boolean {
    const target = accounts.value.find((account) => account.id === id && account.isActive)
    if (!target) {
      notify('账号不存在或已停用', 'error')
      return false
    }
    if (target.id === currentAccountId.value) return true

    saveCurrentAccountWorkspace()
    currentAccountId.value = target.id
    accounts.value = accounts.value.map((account) => account.id === target.id
      ? { ...account, lastActiveAt: new Date().toISOString() }
      : account)
    applyPersistedState(readAccountState(target.id))
    persistAuthState()
    persistBrowserState(snapshotBrowserState())
    notify(`已切换到账号：${target.displayName}`)
    return true
  }

  function removeAccount(id: string): boolean {
    const target = accounts.value.find((account) => account.id === id)
    if (!target) return false
    if (accounts.value.length <= 1) {
      notify('至少保留一个账号', 'error')
      return false
    }
    if (target.role === 'admin' && accounts.value.filter((account) => account.role === 'admin').length <= 1) {
      notify('至少保留一个管理员账号', 'error')
      return false
    }

    const wasCurrent = target.id === currentAccountId.value
    const nextAccounts = accounts.value.filter((account) => account.id !== id)
    const nextCurrent = wasCurrent
      ? nextAccounts.find((account) => account.isActive) ?? nextAccounts[0]
      : currentAccount.value

    accounts.value = nextAccounts
    currentAccountId.value = nextCurrent.id
    const nextSecrets = { ...accountSecrets.value }
    delete nextSecrets[id]
    accountSecrets.value = nextSecrets
    browserStorage.remove(accountStateKey(id))
    if (wasCurrent) applyPersistedState(readAccountState(nextCurrent.id))
    persistAuthState()
    persistBrowserState(snapshotBrowserState())
    notify(`已删除账号：${target.displayName}`, 'info')
    return true
  }

  function repairDefaultImageModel(): void {
    settings.value.defaultImageModelId = normalizeDefaultImageModelId(settings.value.defaultImageModelId, models.value)
  }

  function resolveMode(value: string | null | undefined): GenerationMode {
    if (!value) return 'txt2img'
    if (value in modeLabels) return value as GenerationMode
    return modeAliases[value] ?? 'txt2img'
  }

  function setMode(mode: GenerationMode): void {
    activeMode.value = mode
  }

  function setActivePrompt(prompt: string): void {
    activePrompt.value = prompt
  }

  async function loadPersistedTasks(): Promise<void> {
    const backendState = await invokeOptional<PersistedState>('load_app_state').catch((error: unknown) => {
      console.warn('Failed to load app state from Electron', error)
      return null
    })
    if (backendState) {
      applyPersistedState(backendState)
      persistBrowserState(snapshotBrowserState())
    }

    const backendTasks = await invokeOptional<GenerationTask[]>('list_generation_tasks', { limit: 500 }).catch((error: unknown) => {
      console.warn('Failed to load persisted tasks from Electron', error)
      return null
    })
    if (!backendTasks?.length) return

    const existingIds = new Set(tasks.value.map((task) => task.id))
    const merged = [...backendTasks.filter((task) => !existingIds.has(task.id)), ...tasks.value]
    tasks.value = merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    persist()
  }

  async function generate(input: GenerationInput): Promise<GenerationTask> {
    const isVideoMode = input.mode === 'txt2video' || input.mode === 'img2video'
    const selectedModel = (isVideoMode ? videoModels.value : imageModels.value).find((model) => model.id === input.modelId)
    const routeCandidates = selectedModel ? generationRouteCandidates(selectedModel, isVideoMode ? 'video' : 'image') : []
    const validationMessage = routeCandidates.length ? null : generationValidationMessage(selectedModel, isVideoMode ? 'video' : 'image')
    if (validationMessage) {
      const failedTask = createFailedGenerationTask(input, new Error(validationMessage), selectedModel)
      recordGenerationTask(failedTask)
      notify(validationMessage, 'error')
      throw new Error(validationMessage)
    }
    let task: GenerationTask | null = null
    let lastError: unknown = null
    let lastAttemptedModel: ModelProfile | undefined = selectedModel
    try {
      for (const routeModel of routeCandidates) {
        lastAttemptedModel = routeModel
        const routedInput = routeModel.id === input.modelId ? input : { ...input, modelId: routeModel.id }
        try {
          if (isElectronRuntime()) {
            const commandResult = await invokeOptional<GenerationTask>('create_generation_task', { input: routedInput, model: routeModel })
            if (!commandResult) throw new Error('Electron 生成命令不可用')
            task = commandResult
          } else {
            const webResult = await createWebGenerationTask(routedInput, routeModel)
            if (!webResult) throw new Error('Web 生成代理未启用，请部署 /api/generation 或使用桌面版')
            task = webResult
          }
          break
        } catch (error) {
          lastError = error
        }
      }
      if (!task) throw lastError ?? new Error(isElectronRuntime() ? 'Electron 生成命令不可用' : 'Web 生成代理未启用，请部署 /api/generation 或使用桌面版')
    } catch (error) {
      const failedTask = createFailedGenerationTask(input, error, lastAttemptedModel)
      recordGenerationTask(failedTask)
      notify(failedTask.error ?? '生成失败', 'error')
      throw new Error(failedTask.error ?? '生成失败', { cause: error })
    }

    if (settings.value.autoSaveHistory) {
      recordGenerationTask(task)
      notify(`已生成 ${task.assets.length} 个${modeLabels[task.mode]}结果`)
    } else {
      notify(`已生成 ${task.assets.length} 个${modeLabels[task.mode]}结果，未保存到资产库`, 'info')
    }
    return task
  }

  function recordGenerationTask(task: GenerationTask): void {
    tasks.value = [task, ...tasks.value.filter((item) => item.id !== task.id)]
    persist()
  }

  function generationValidationMessage(model: ModelProfile | undefined, kind: 'image' | 'video'): string | null {
    const label = kind === 'video' ? '视频' : '图像'
    if (!model || model.provider === 'local-preview') return `请先配置并选择真实${label}模型`
    if (!model.endpoint.trim()) return `请填写${label}模型 API 地址`
    if (!model.apiKey.trim()) return `请填写${label}模型 API Key`
    if (model.apiProtocol === 'mgtv-storyboard' && !model.apiSecret?.trim()) return '请填写 MGTV 图像模型 Secret Key'
    if (!model.model.trim()) return `请填写${label}模型 ID`
    return null
  }

  function generationRouteCandidates(selectedModel: ModelProfile, kind: 'image' | 'video'): ModelProfile[] {
    const selectedKey = modelRouteKey(selectedModel)
    return sortRouteProfiles(
      models.value.filter((model) => (
        model.kind === kind
        && modelRouteKey(model) === selectedKey
        && generationValidationMessage(model, kind) === null
      )),
      selectedModel.id,
    )
  }

  function textModelValidationMessage(model: ModelProfile | undefined): string | null {
    if (!model || model.provider === 'local-preview') return '请先配置可用的文本模型'
    if (!model.endpoint.trim()) return '请填写文本模型 API 地址'
    if (!model.apiKey.trim()) return '请填写文本模型 API Key'
    if (!model.model.trim()) return '请填写文本模型 ID'
    return null
  }

  function textRouteCandidates(selectedId?: string): ModelProfile[] {
    const selectedTextModel = textModels.value.find((model) => model.id === selectedId) ?? primaryTextModel.value
    return sortRouteProfiles(
      textModels.value.filter((model) => textModelValidationMessage(model) === null),
      selectedTextModel?.id,
    )
  }

  async function invokeTextPolishAutoRoute(input: TextPolishInput, modelId?: string): Promise<TextPolishResult | null> {
    if (!isElectronRuntime()) return null
    const routeCandidates = textRouteCandidates(modelId)
    if (!routeCandidates.length) return null

    let lastError: unknown = null
    for (const routeModel of routeCandidates) {
      try {
        const result = await invokeOptional<TextPolishResult>('polish_prompt', { input, model: routeModel })
        if (!result) throw new Error('Electron 文本生成命令不可用')
        return result
      } catch (error) {
        lastError = error
      }
    }
    throw new Error(errorMessage(lastError, '文本模型 auto 路由失败'))
  }

  async function polishPrompt(input: TextPolishInput, modelId?: string): Promise<TextPolishResult> {
    const selectedTextModel = textModels.value.find((model) => model.id === modelId) ?? primaryTextModel.value
    if (isElectronRuntime()) {
      const routedResult = await invokeTextPolishAutoRoute(input, modelId)
      if (routedResult) {
        notify(textPolishSuccessMessage(input.task, routedResult.modelName))
        return routedResult
      }
    }

    const modelName = selectedTextModel?.name ?? '本地文本润色'
    if (input.task === 'translate-to-english') {
      const details = randomPolishDetails(2).join(', ')
      const result = {
        prompt: [
          input.prompt.trim(),
          `${input.style} style`,
          details,
        ].join(', '),
        modelName,
      }
      notify(textPolishSuccessMessage(input.task, result.modelName))
      return result
    }
    if (input.task === 'video-prompt') {
      const details = randomPolishDetails(2).join('，')
      const result = {
        prompt: [
          input.prompt.trim() || '一个高质量的 AI 生成场景',
          `${input.style}风格`,
          '主体明确，动作连续，场景稳定，镜头运动自然',
          details,
        ].join('，'),
        modelName,
      }
      notify(textPolishSuccessMessage(input.task, result.modelName))
      return result
    }
    if (input.task === 'negative-prompt') {
      const base = input.prompt.trim() || '低清晰度、变形、文字水印、错误构图'
      const result = {
        prompt: Array.from(new Set([
          ...base.split(/[，,、]/).map((item) => item.trim()).filter(Boolean),
          '低清晰度',
          '结构变形',
          '多余肢体',
          '文字水印',
          '噪点',
          '过曝',
          '构图混乱',
        ])).join('、'),
        modelName,
      }
      notify(textPolishSuccessMessage(input.task, result.modelName))
      return result
    }
    const details = randomPolishDetails(2).join('，')
    const result = {
      prompt: [
        input.prompt.trim() || '一个高质量的 AI 生成场景',
        `${input.style}风格`,
        details,
      ].join('，'),
      modelName,
    }
    notify(textPolishSuccessMessage(input.task, result.modelName))
    return result
  }

  async function translatePromptToEnglish(input: TextPolishInput, modelId?: string): Promise<TextPolishResult> {
    if (!containsChineseText(input.prompt)) return { prompt: input.prompt, modelName: '无需翻译' }
    const request: TextPolishInput = { ...input, task: 'translate-to-english' }
    if (isElectronRuntime()) {
      const routedResult = await invokeTextPolishAutoRoute(request, modelId)
      if (routedResult) {
        notify(textPolishSuccessMessage(request.task, routedResult.modelName))
        return routedResult
      }
      throw new Error('检测到中文提示词，请先配置可用的文本模型用于自动翻译英文提示词')
    }
    if (!textRouteCandidates(modelId).length) {
      throw new Error('检测到中文提示词，请先配置可用的文本模型用于自动翻译英文提示词')
    }
    return polishPrompt(request, modelId)
  }

  async function fetchModelCatalog(profile: ModelProfile): Promise<ModelCatalogItem[]> {
    if (isElectronRuntime()) {
      const result = await invokeOptional<ModelCatalogItem[]>('list_model_catalog', { profile })
      if (result) return result
    }
    return fetchModelCatalogOverHttp(profile)
  }

  function importPrompts(content: string, filename: string): number {
    return importPromptBatch([{ content, filename }])
  }

  function importPromptBatch(files: Array<{ content: string; filename: string }>): number {
    const imported = files.flatMap((file) => normalizePromptImport(file.content, file.filename))
    const before = prompts.value.length
    prompts.value = mergePromptItems(prompts.value, imported)
    persist()
    const count = prompts.value.length - before
    notify(count ? `已导入 ${count} 条提示词` : '没有新增提示词', count ? 'success' : 'info')
    return count
  }

  async function syncPromptSource(key: PromptSyncSource['key']): Promise<void> {
    const source = promptSyncSources.find((item) => item.key === key)
    if (!source) {
      notify('未知的同步来源', 'error')
      return
    }

    const backup = prompts.value.slice()
    let lastError: unknown = null

    for (const url of source.candidates) {
      try {
        const response = await fetch(url, { cache: 'no-cache' })
        if (!response.ok) {
          lastError = new Error(`HTTP ${response.status}`)
          continue
        }

        const content = await response.text()
        const imported = normalizePromptSync(content, key, url)
        if (!imported.length) {
          lastError = new Error('未解析到提示词')
          continue
        }

        const keep = prompts.value.filter((item) => item.source !== key)
        prompts.value = mergePromptItems(keep, imported)
        promptSync.value = {
          ...promptSync.value,
          [key]: {
            at: new Date().toISOString(),
            count: imported.length,
            url,
          },
        }
        persist()
        notify(`${source.label} 已同步 ${imported.length} 条提示词`)
        return
      } catch (error) {
        lastError = error
      }
    }

    prompts.value = backup
    persist()
    const message = lastError instanceof Error ? lastError.message : '网络错误'
    notify(`${source.label} 同步失败：${message}，已保留本地数据`, 'error')
  }

  function usePrompt(item: PromptItem): void {
    activePrompt.value = item.promptEn || item.prompt
    notify(`已应用提示词：${item.title}`)
  }

  function removePrompt(id: string): void {
    const target = prompts.value.find((item) => item.id === id)
    if (!target) return
    if (target.source === 'builtin') {
      notify('内置提示词不能删除', 'error')
      return
    }

    prompts.value = prompts.value.filter((item) => item.id !== id)
    persist()
    notify(`已删除提示词：${target.title}`)
  }

  function saveModels(profiles: ModelProfile[], successMessage = '模型配置已保存'): void {
    const nextProfiles = profiles.map((profile) => normalizeModelProfile(profile.id ? profile : { ...profile, id: createId('model') }))
    if (!nextProfiles.length) {
      notify('没有可保存的模型配置', 'error')
      return
    }
    if (nextProfiles.some((profile) => profile.provider === 'local-preview' || profile.id === 'local-preview')) {
      notify('本地预览模型已移除，请配置真实图像模型', 'error')
      return
    }

    let nextModels = models.value.slice()
    for (const next of nextProfiles) {
      if (next.isPrimary) {
        nextModels = nextModels.map((model) => (model.kind === next.kind ? { ...model, isPrimary: false } : model))
      }
      const index = nextModels.findIndex((model) => model.id === next.id)
      if (index >= 0) nextModels[index] = next
      else nextModels.push(next)
    }
    models.value = nextModels
    repairDefaultImageModel()
    persist()
    notify(successMessage)
  }

  function replaceModelsForEndpoint(endpoint: string, profiles: ModelProfile[], successMessage = '模型配置已保存'): void {
    const nextProfiles = profiles.map((profile) => normalizeModelProfile(profile.id ? profile : { ...profile, id: createId('model') }))
    if (nextProfiles.some((profile) => profile.provider === 'local-preview' || profile.id === 'local-preview')) {
      notify('本地预览模型已移除，请配置真实图像模型', 'error')
      return
    }

    const normalizedEndpoint = normalizedModelEndpoint(endpoint || nextProfiles[0]?.endpoint || '')
    const nextIds = new Set(nextProfiles.map((profile) => profile.id))
    let nextModels = models.value.filter((model) => (
      normalizedModelEndpoint(model.endpoint) !== normalizedEndpoint || nextIds.has(model.id)
    ))
    for (const next of nextProfiles) {
      if (next.isPrimary) {
        nextModels = nextModels.map((model) => (model.kind === next.kind ? { ...model, isPrimary: false } : model))
      }
      const index = nextModels.findIndex((model) => model.id === next.id)
      if (index >= 0) nextModels[index] = next
      else nextModels.push(next)
    }
    models.value = nextModels
    repairDefaultImageModel()
    persist()
    notify(successMessage)
  }

  function saveModel(profile: ModelProfile): void {
    saveModels([profile])
  }

  function setPrimaryImageModel(id: string): void {
    const target = models.value.find((model) => model.id === id && model.kind === 'image')
    if (!target) {
      notify('请选择有效的图像模型', 'error')
      return
    }
    models.value = models.value.map((model) => (
      model.kind === 'image' ? { ...model, isPrimary: model.id === id } : model
    ))
    settings.value.defaultImageModelId = id
    persist()
    notify(`已设为主模型：${target.name}`)
  }

  function setPrimaryTextModel(id: string): void {
    const target = models.value.find((model) => model.id === id && model.kind === 'text')
    if (!target) {
      notify('请选择有效的文本模型', 'error')
      return
    }
    models.value = models.value.map((model) => (
      model.kind === 'text' ? { ...model, isPrimary: model.id === id } : model
    ))
    persist()
    notify(`已设为主文本模型：${target.name}`)
  }

  function setPrimaryTtsModel(id: string): void {
    const target = models.value.find((model) => model.id === id && model.kind === 'tts')
    if (!target) {
      notify('请选择有效的语音模型', 'error')
      return
    }
    models.value = models.value.map((model) => (
      model.kind === 'tts' ? { ...model, isPrimary: model.id === id } : model
    ))
    persist()
    notify(`已设为主语音模型：${target.name}`)
  }

  function setPrimaryVideoModel(id: string): void {
    const target = models.value.find((model) => model.id === id && model.kind === 'video')
    if (!target) {
      notify('请选择有效的视频模型', 'error')
      return
    }
    models.value = models.value.map((model) => (
      model.kind === 'video' ? { ...model, isPrimary: model.id === id } : model
    ))
    persist()
    notify(`已设为主视频模型：${target.name}`)
  }

  function modelConnectionValidationMessage(model: ModelProfile): string | null {
    if (model.provider === 'local-preview') return null
    if (!model.endpoint.trim()) return model.kind === 'text' ? '请填写文本模型 API 地址' : '请填写 API 地址'
    if (!model.apiKey.trim()) return model.kind === 'text' ? '请填写文本模型 API Key' : '请填写 API Key'
    if (model.kind === 'image' && model.apiProtocol === 'mgtv-storyboard' && !model.apiSecret?.trim()) return '请填写 MGTV 图像模型 Secret Key'
    if (model.kind === 'text' && !model.model.trim()) return '请填写文本模型 ID'
    if (model.kind === 'image' && !model.model.trim()) return '请填写图像模型 ID'
    if (model.kind === 'video' && !model.model.trim()) return '请填写视频模型 ID'
    return null
  }

  async function testModel(id: string): Promise<void> {
    const model = models.value.find((item) => item.id === id)
    if (!model) return
    const validationMessage = modelConnectionValidationMessage(model)
    if (validationMessage) {
      model.status = 'failed'
      model.lastCheckedAt = new Date().toISOString()
      persist()
      notify(validationMessage, 'error')
      return
    }
    if (!isElectronRuntime()) {
      const result = await fetchModelCatalogOverHttp(model)
        .then((items) => ({
          ok: items.length > 0,
          message: items.length ? `模型列表接口可用，已获取 ${items.length} 个模型` : '模型列表为空，请检查 BASE_URL 或 API Key',
        }))
        .catch((error: unknown) => ({
          ok: false,
          message: error instanceof Error ? error.message : '模型连接检测失败',
        }))
      model.status = result.ok ? 'connected' : 'failed'
      model.lastCheckedAt = new Date().toISOString()
      persist()
      notify(result.message, result.ok ? 'success' : 'error')
      return
    }
    const result = await invokeOptional<{ ok: boolean; message: string }>('test_model_profile', { profile: model }).catch((error: unknown) => ({
      ok: false,
      message: error instanceof Error ? error.message : '模型连接检测失败',
    }))
    model.status = result?.ok ? 'connected' : 'failed'
    model.lastCheckedAt = new Date().toISOString()
    persist()
    notify(result?.message ?? (isElectronRuntime() ? '模型连接检测失败' : '浏览器预览模式无法直连模型 API'), result?.ok ? 'success' : 'error')
  }

  function removeModel(id: string): void {
    models.value = models.value.filter((model) => model.id !== id)
    if (!imageModels.value.some((model) => model.isPrimary) && imageModels.value[0]) {
      const firstId = imageModels.value[0].id
      models.value = models.value.map((m) => m.id === firstId ? { ...m, isPrimary: true } : m)
    }
    if (!videoModels.value.some((model) => model.isPrimary) && videoModels.value[0]) {
      const firstId = videoModels.value[0].id
      models.value = models.value.map((m) => m.id === firstId ? { ...m, isPrimary: true } : m)
    }
    repairDefaultImageModel()
    persist()
    notify('模型已删除')
  }

  function saveSettings(next: Partial<AppSettings>): void {
    settings.value = { ...settings.value, ...next }
    settings.value.defaultExportFormat = normalizeDefaultExportFormat(settings.value.defaultExportFormat)
    settings.value.defaultImageModelId = normalizeDefaultImageModelId(settings.value.defaultImageModelId, models.value)
    settings.value.defaultGenerationSize = normalizeInteger(settings.value.defaultGenerationSize, defaultState.settings.defaultGenerationSize, 128, 4096)
    settings.value.defaultBatchSize = normalizeInteger(settings.value.defaultBatchSize, defaultState.settings.defaultBatchSize, 1, 4)
    settings.value.defaultStyle = normalizeStyle(settings.value.defaultStyle)
    persist()
    notify('设置已保存')
  }

  function addCoverPreset(preset: Omit<CoverPreset, 'id' | 'custom'>): boolean {
    const rawWidth = Number(preset.width)
    const rawHeight = Number(preset.height)
    if (!Number.isFinite(rawWidth) || !Number.isFinite(rawHeight) || rawWidth < 128 || rawWidth > 4096 || rawHeight < 128 || rawHeight > 4096) {
      notify('请输入 128 到 4096 之间的有效尺寸', 'error')
      return false
    }
    const width = Math.round(rawWidth)
    const height = Math.round(rawHeight)

    coverPresets.value.push({ ...preset, width, height, id: createId('cover'), custom: true })
    persist()
    notify('封面预设已添加')
    return true
  }

  function setCoverPresetEnabled(id: string, enabled: boolean): void {
    const preset = coverPresets.value.find((item) => item.id === id)
    if (!preset) return
    preset.enabled = enabled
    persist()
    notify(enabled ? '封面预设已启用' : '封面预设已停用', 'info')
  }

  function removeCoverPreset(id: string): void {
    const preset = coverPresets.value.find((item) => item.id === id)
    if (preset && !preset.custom) {
      notify('内置封面预设不能删除，可在系统设置中停用', 'error')
      return
    }
    coverPresets.value = coverPresets.value.filter((preset) => preset.id !== id)
    persist()
    notify('封面预设已删除')
  }

  function resetCoverPresets(): void {
    coverPresets.value = cloneDefaultCoverPresets()
    persist()
    notify('已恢复默认封面预设')
  }

  async function resetDemoData(): Promise<void> {
    const fresh = cloneDefault()
    models.value = fresh.models
    prompts.value = fresh.prompts
    coverPresets.value = fresh.coverPresets
    settings.value = fresh.settings
    tasks.value = []
    activePrompt.value = ''
    await invokeOptional('clear_generation_tasks').catch((error: unknown) => {
      console.warn('Failed to clear persisted tasks from Electron', error)
    })
    persist()
    notify('已恢复初始数据')
  }

  async function clearHistory(): Promise<void> {
    tasks.value = []
    await invokeOptional('clear_generation_tasks').catch((error: unknown) => {
      console.warn('Failed to clear persisted tasks from Electron', error)
    })
    persist()
    notify('资产库已清空')
  }

  async function removeGeneratedAsset(taskId: string, assetId: string): Promise<void> {
    const task = tasks.value.find((item) => item.id === taskId)
    if (!task) return

    const target = task.assets.find((asset) => asset.id === assetId)
    if (!target) return

    const nextAssets = task.assets.filter((asset) => asset.id !== assetId)
    if (nextAssets.length) {
      task.assets = nextAssets
    } else {
      tasks.value = tasks.value.filter((item) => item.id !== taskId)
    }

    await invokeOptional('delete_generation_asset', { taskId, assetId }).catch((error: unknown) => {
      console.warn('Failed to delete generated asset from Electron', error)
    })
    persist()
    notify(`已删除图片：${target.title}`)
  }

  function toggleTaskFavorite(id: string): void {
    const task = tasks.value.find((item) => item.id === id)
    if (!task) return
    task.isFavorite = !task.isFavorite
    persist()
    notify(task.isFavorite ? `已收藏：${task.prompt}` : `已取消收藏：${task.prompt}`, task.isFavorite ? 'success' : 'info')
  }

  function toggleAssetFavorite(assetId: string): void {
    for (const task of tasks.value) {
      const asset = task.assets.find((item) => item.id === assetId)
      if (asset) {
        asset.isFavorite = !asset.isFavorite
        persist()
        notify(asset.isFavorite ? '已加入收藏' : '已取消收藏', asset.isFavorite ? 'success' : 'info')
        return
      }
    }
  }

  async function downloadAllAssets(
    format: ExportFormat = settings.value.defaultExportFormat,
    options?: { iconSizes?: number[]; canvasFilter?: string; titleSuffix?: string },
  ): Promise<void> {
    const taskAssets = completedAssets.value
      .filter(({ asset }) => asset.mediaType !== 'video' && asset.format !== 'mp4')
    if (!taskAssets.length) {
      notify('暂无可批量导出的图片结果；视频请在详情中打开链接保存', 'info')
      return
    }

    for (const { task, asset } of taskAssets) {
      await downloadAsset(asset, format, 1, task, options)
    }
    notify(`已导出 ${taskAssets.length} 个结果`)
  }

  async function downloadAsset(
    asset: GeneratedAsset,
    format: ExportFormat = settings.value.defaultExportFormat,
    scale = 1,
    task?: GenerationTask,
    options?: { iconSizes?: number[]; canvasFilter?: string; titleSuffix?: string; customTitle?: string },
  ): Promise<void> {
    if (asset.mediaType === 'video' || asset.format === 'mp4') {
      triggerBrowserDownload(asset.remoteUrl ?? asset.dataUrl, `${asset.title}.mp4`)
      notify('已打开视频链接，可在浏览器中保存 MP4')
      return
    }
    const exportScale = format === 'ico' ? 1 : scale
    const exportData = await prepareExportAsset(asset, format, exportScale, options)
    const baseTitle = options?.customTitle?.trim() || asset.title
    const exportTitle = `${baseTitle}${options?.titleSuffix ?? ''}`
    const metadataJson = settings.value.includePromptMetadata && task ? createExportMetadataJson(task, asset, exportData, exportScale) : undefined
    const result = await invokeOptional<{ path: string; metadataPath?: string }>('export_generated_asset', {
      request: {
        dataUrl: exportData.dataUrl,
        outputDir: settings.value.defaultOutputDir,
        title: exportTitle,
        format: exportData.format,
        metadataJson,
      },
    }).catch((error: unknown) => {
      console.warn('Electron export failed; using browser download fallback', error)
      return null
    })

    if (result?.path) {
      asset.localPath = result.path
      persist()
      notify(result.metadataPath ? `已导出到 ${result.path}，元数据已保存` : `已导出到 ${result.path}`)
      return
    }

    triggerBrowserDownload(exportData.dataUrl, `${exportTitle}.${exportData.format}`)
    if (metadataJson) {
      const metadataUrl = URL.createObjectURL(new Blob([metadataJson], { type: 'application/json' }))
      triggerBrowserDownload(metadataUrl, `${exportTitle}.metadata.json`)
      setTimeout(() => URL.revokeObjectURL(metadataUrl), 10000)
    }
    notify(metadataJson ? '已导出图片和提示词元数据到浏览器下载目录' : '已导出到浏览器下载目录')
  }

  async function downloadIconBundle(
    asset: GeneratedAsset,
    selectedSizes: number[],
    projectName?: string,
  ): Promise<void> {
    if (!selectedSizes.length) {
      notify('请至少选择一个导出尺寸', 'error')
      return
    }

    const baseName = (projectName ?? '').trim() || asset.title || 'icon'
    const image = await loadImageFromDataUrl(asset.dataUrl)
    const entries: Array<{ name: string; dataUrl: string }> = []

    for (const size of selectedSizes.sort((a, b) => a - b)) {
      const { canvas, context } = createCanvas(size, size)
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(image, 0, 0, size, size)

      // 每个尺寸生成独立的单帧 ICO 文件
      const pngBytes = await canvasToPngBytes(canvas)
      const icoBytes = buildIcoFile([{ size, bytes: pngBytes }])
      entries.push({ name: `${baseName}_${size}x${size}.ico`, dataUrl: bytesToDataUrl(icoBytes, 'image/x-icon') })
    }

    // Electron 模式：后端打包 ZIP 写入本地
    const result = await invokeOptional<string>('export_icon_bundle', {
      request: {
        entries,
        outputDir: settings.value.defaultOutputDir,
        bundleName: baseName,
      },
    }).catch((error: unknown) => {
      console.warn('Electron icon bundle export failed; using browser download fallback', error)
      return null
    })

    if (result) {
      notify(`已导出 ${selectedSizes.length} 个 ICO 图标到 ${result}`)
      return
    }

    // 浏览器模式：前端打包 ZIP 下载
    const fileBuffers: Array<{ name: string; data: Uint8Array }> = []
    for (const entry of entries) {
      const base64 = entry.dataUrl.split(',')[1] ?? ''
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      fileBuffers.push({ name: entry.name, data: bytes })
    }

    const zipBytes = buildZipFile(fileBuffers)
    const blob = new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    triggerBrowserDownload(url, `${baseName}.zip`)
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    notify(`已导出 ${selectedSizes.length} 个 ICO 图标到浏览器下载目录`)
  }

  async function prepareExportAsset(
    asset: GeneratedAsset,
    format: ExportFormat,
    scale = 1,
    options?: { iconSizes?: number[]; canvasFilter?: string; titleSuffix?: string },
  ): Promise<ExportAssetData> {
    const hasFilter = Boolean(options?.canvasFilter && options.canvasFilter !== 'none')
    if (format === 'gif') {
      const dataUrl = asset.dataUrl.startsWith('data:image/gif') ? asset.dataUrl : fallbackGifDataUrl
      return { dataUrl, format: 'gif', width: asset.width, height: asset.height }
    }
    if (format === 'mp4') return { dataUrl: asset.remoteUrl ?? asset.dataUrl, format: 'mp4', width: asset.width, height: asset.height }
    if (!hasFilter && format === asset.format && scale === 1) return { dataUrl: asset.dataUrl, format, width: asset.width, height: asset.height }
    if (format === 'ico') return createIcoDataUrl(asset.dataUrl, asset.width, asset.height, options?.iconSizes)
    if (format === 'svg') return { dataUrl: asset.dataUrl, format: asset.format, width: asset.width, height: asset.height }
    const width = asset.width * scale
    const height = asset.height * scale
    return { dataUrl: await rasterizeDataUrl(asset.dataUrl, width, height, format, options?.canvasFilter), format, width, height }
  }

  function createExportMetadataJson(task: GenerationTask, asset: GeneratedAsset, exportData: ExportAssetData, scale: number): string {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        taskId: task.id,
        mode: task.mode,
        prompt: task.prompt,
        negativePrompt: task.negativePrompt,
        modelId: task.modelId,
        width: task.width,
        height: task.height,
        batchSize: task.batchSize,
        steps: task.steps,
        seed: task.seed,
        style: task.style,
        modeOptions: task.modeOptions ?? {},
        status: task.status,
        createdAt: task.createdAt,
        asset: {
          id: asset.id,
          title: asset.title,
          format: exportData.format,
          width: exportData.width,
          height: exportData.height,
          bundleSizes: exportData.bundleSizes ?? [],
          originalFormat: asset.format,
          originalWidth: asset.width,
          originalHeight: asset.height,
          exportScale: scale,
          createdAt: asset.createdAt,
        },
      },
      null,
      2,
    )
  }

  function triggerBrowserDownload(href: string, filename: string): void {
    const link = document.createElement('a')
    link.href = href
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return {
    models,
    prompts,
    tasks,
    coverPresets,
    promptSync,
    settings,
    accounts,
    activeAccounts,
    currentAccountId,
    currentAccount,
    currentAccountIsAdmin,
    isAuthenticated,
    toast,
    activePrompt,
    activeMode,
    imageModels,
    textModels,
    ttsModels,
    videoModels,
    primaryImageModel,
    primaryTextModel,
    primaryVideoModel,
    defaultImageModel,
    textAutoRouteProfiles,
    modelRouteGroups,
    enabledCoverPresets,
    recentTasks,
    operationTasks,
    historyTasks,
    historyAssetCount,
    completedAssets,
    favoriteTasks,
    favoriteAssets,
    promptSyncSources,
    createAccount,
    loginAccount,
    loginAccountByIdentifier,
    logout,
    updateAccount,
    switchAccount,
    removeAccount,
    resolveMode,
    setMode,
    setActivePrompt,
    loadPersistedTasks,
    generate,
    polishPrompt,
    translatePromptToEnglish,
    fetchModelCatalog,
    importPrompts,
    importPromptBatch,
    syncPromptSource,
    usePrompt,
    removePrompt,
    saveModels,
    replaceModelsForEndpoint,
    saveModel,
    setPrimaryImageModel,
    setPrimaryTextModel,
    setPrimaryTtsModel,
    setPrimaryVideoModel,
    testModel,
    removeModel,
    saveSettings,
    addCoverPreset,
    setCoverPresetEnabled,
    removeCoverPreset,
    resetCoverPresets,
    resetDemoData,
    clearHistory,
    removeGeneratedAsset,
    recordGenerationTask,
    toggleTaskFavorite,
    toggleAssetFavorite,
    downloadAllAssets,
    downloadAsset,
    downloadIconBundle,
    notify,
  }
})
