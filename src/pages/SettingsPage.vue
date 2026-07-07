<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Download, FileText, Plus, RotateCcw, Save, Trash2, Upload } from 'lucide-vue-next'
import EmptyState from '@/components/EmptyState.vue'
import LocaleSwitcher from '@/components/LocaleSwitcher.vue'
import { exportFormatOptions, stylePresets } from '@/data/catalog'
import { useAppStore, type ModelRouteGroup } from '@/stores/app'
import type { ModelCatalogItem, ModelProfile, PromptItem } from '@/types/domain'
import { createId } from '@/domain/ids'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const store = useAppStore()
const router = useRouter()
const activeTab = ref<'models' | 'prompts' | 'generation' | 'system'>('models')
const promptSearch = ref('')
const promptSourceFilter = ref('all')
const promptCategoryFilter = ref('all')
const promptOriginFilter = ref<'all' | 'imported' | 'builtin'>('all')
const promptImportDragging = ref(false)
const modelCatalogSearch = ref('')
const selectedCatalogModelIds = ref<Set<string>>(new Set())
const remoteModelCatalog = ref<ModelCatalogEntry[]>([])
const modelCatalogLoading = ref(false)
const modelCatalogNotice = ref('')
type ChannelPresetId = 'openai' | 'agnes' | 'third-party'
type ChannelBaseUrlPresetId = 'openai' | 'agnes' | 'custom'
type ChannelDefaultModelKind = 'all' | ModelProfile['kind']

const channelPresetId = ref<ChannelPresetId>('third-party')
const channelBaseUrlPresetId = ref<ChannelBaseUrlPresetId>('custom')
const channelDefaultModelKind = ref<ChannelDefaultModelKind>('all')
const channelRemark = ref('')
const apiKeyVisible = ref(false)
const modelBenchmarkWindow = ref<'3m' | '6m' | '12m'>('3m')
const modelManagerSearch = ref('')
const modelManagerKindFilter = ref<'all' | ModelProfile['kind']>('all')
const editingModelId = ref('')
const testingModelIds = ref<Set<string>>(new Set())
const selectedRouteProfileId = ref('')
const coverPresetModalOpen = ref(false)
const coverPresetName = ref('')
const coverPresetWidth = ref(1080)
const coverPresetHeight = ref(608)
const coverPresetEnabled = ref(true)
const draft = ref<ModelProfile>({
  id: '',
  name: '',
  provider: 'openai-compatible',
  endpoint: '',
  apiPath: 'v1/images/generations',
  apiProtocol: 'openai-images',
  apiKey: '',
  apiSecret: '',
  headersJson: '',
  note: '',
  model: '',
  kind: 'image',
  isPrimary: false,
  status: 'untested',
})

type ModelCatalogEntry = ModelCatalogItem & {
  model: string
  provider: 'openai-compatible'
  kind: 'image' | 'text' | 'tts' | 'video' | 'unknown'
  endpoint: string
  apiPath: string
  apiProtocol: NonNullable<ModelProfile['apiProtocol']>
}

type ProtocolOption = {
  value: NonNullable<ModelProfile['apiProtocol']>
  label: string
  path: string
}
type ApiChannelEntry = {
  key: string
  profile: ModelProfile
  profiles: ModelProfile[]
  name: string
}
type ChannelPreset = {
  id: ChannelPresetId
  label: string
  name: string
  endpoint: string
}
type BaseUrlPreset = {
  id: ChannelBaseUrlPresetId
  label: string
  endpoint: string
}

const channelPresets: ChannelPreset[] = [
  { id: 'openai', label: 'OpenAI', name: 'OpenAI', endpoint: 'https://api.openai.com' },
  { id: 'agnes', label: 'Agnes', name: 'Agnes', endpoint: 'https://apihub.agnes-ai.com' },
  { id: 'third-party', label: t('settings.channelThirdParty'), name: t('settings.channelThirdParty'), endpoint: '' },
]
const channelBaseUrlPresets: BaseUrlPreset[] = [
  { id: 'openai', label: 'OpenAI', endpoint: 'https://api.openai.com' },
  { id: 'agnes', label: 'Agnes', endpoint: 'https://apihub.agnes-ai.com' },
  { id: 'custom', label: t('settings.channelThirdParty'), endpoint: '' },
]

const textProtocolOptions: ProtocolOption[] = [
  { value: 'openai-chat', label: t('settings.protocolOpenaiStandard'), path: 'v1/chat/completions' },
  { value: 'anthropic-messages', label: t('settings.protocolAnthropic'), path: 'v1/messages' },
]
const imageProtocolOptions: ProtocolOption[] = [
  { value: 'agnes-image', label: t('settings.protocolAgnesImage'), path: 'v1/images/generations' },
  { value: 'openai-images', label: t('settings.protocolOpenaiImages'), path: 'v1/images/generations' },
  { value: 'dashscope-wanxiang', label: t('settings.protocolDashscope'), path: 'api/v1/services/aigc/multimodal-generation/generation' },
  { value: 'mgtv-storyboard', label: t('settings.protocolMgtv'), path: 'openapi/v1/storyboard/generateByPromptV2' },
  { value: 'openai-image-edits', label: t('settings.protocolImagesEdits'), path: 'v1/images/edits' },
  { value: 'multimodal-chat', label: t('settings.protocolMultimodal'), path: 'v1/chat/completions' },
]
const videoProtocolOptions: ProtocolOption[] = [
  { value: 'agnes-video', label: t('settings.protocolAgnesVideo'), path: 'v1/videos' },
]
const ttsProtocolOptions: ProtocolOption[] = [
  { value: 'openai-audio-speech', label: t('settings.protocolOpenaiSpeech'), path: 'v1/audio/speech' },
]
const modelManagerKindTabs: Array<{ value: ModelProfile['kind']; label: string }> = [
  { value: 'image', label: t('settings.kind.image') },
  { value: 'video', label: t('settings.kind.video') },
  { value: 'text', label: t('settings.kind.text') },
  { value: 'tts', label: t('settings.kind.tts') },
]

const promptSources = computed(() => Array.from(new Set(store.prompts.map((item) => item.source))))
const promptCategories = computed(() => Array.from(new Set(store.prompts.flatMap((item) => [item.category, item.subCategory]).filter(Boolean))))
const filteredPrompts = computed(() => {
  const keyword = promptSearch.value.trim().toLowerCase()
  return store.prompts.filter((item) => {
    if (promptOriginFilter.value === 'imported' && item.source === 'builtin') return false
    if (promptOriginFilter.value === 'builtin' && item.source !== 'builtin') return false
    if (promptSourceFilter.value !== 'all' && item.source !== promptSourceFilter.value) return false
    if (promptCategoryFilter.value !== 'all' && item.category !== promptCategoryFilter.value && item.subCategory !== promptCategoryFilter.value) return false
    if (!keyword) return true
    return [
      item.title,
      item.prompt,
      item.promptZh,
      item.promptEn,
      item.source,
      item.category,
      item.subCategory,
      item.author,
      ...item.tags,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword))
  })
})
const enabledCoverPresetCount = computed(() => store.coverPresets.filter((preset) => preset.enabled).length)
const filteredModelCatalog = computed(() => {
  const keyword = modelCatalogSearch.value.trim().toLowerCase()
  return defaultKindModelCatalog.value
    .filter((item) => !keyword || `${item.name} ${item.model}`.toLowerCase().includes(keyword))
})

const defaultKindModelCatalog = computed(() => remoteModelCatalog.value.filter((item) => channelDefaultModelKind.value === 'all' || item.kind === channelDefaultModelKind.value))

function draftModelCatalogEntry(): ModelCatalogEntry[] {
  const model = draft.value.model.trim()
  if (!model) return []
  return [{
    id: model,
    name: model,
    model,
    provider: 'openai-compatible',
    kind: draft.value.kind,
    endpoint: draft.value.endpoint,
    apiPath: draft.value.apiPath ?? defaultApiPath(draft.value.kind),
    apiProtocol: draft.value.apiProtocol ?? defaultApiProtocol(draft.value.kind),
    source: 'remote',
  }]
}

const channelSelectableModelOptions = computed<ModelCatalogEntry[]>(() => {
  if (remoteModelCatalog.value.length) return defaultKindModelCatalog.value
  return draftModelCatalogEntry()
})

const channelModelOptions = computed<ModelCatalogEntry[]>(() => {
  if (remoteModelCatalog.value.length) return filteredModelCatalog.value
  return draftModelCatalogEntry()
})
const selectedChannelModels = computed(() => channelSelectableModelOptions.value.filter((item) => selectedCatalogModelIds.value.has(item.model)))
const selectedChannelModelCount = computed(() => selectedChannelModels.value.length)
const autoApiTypeSummary = computed(() => `${apiTypeLabel(draft.value)} · ${draft.value.apiPath || defaultApiPath(draft.value.kind)}`)
const managedModels = computed(() => store.models.filter((model) => model.provider !== 'local-preview'))
const managedProfileCount = computed(() => managedModels.value.length)
const savedApiRouteGroups = computed<ModelRouteGroup[]>(() => store.modelRouteGroups.filter((group) => group.profiles.length))
const managedModelCount = computed(() => savedApiRouteGroups.value.length)
const filteredManagedModelGroups = computed(() => {
  const keyword = modelManagerSearch.value.trim().toLowerCase()
  return savedApiRouteGroups.value.filter((group) => {
    if (modelManagerKindFilter.value !== 'all' && group.kind !== modelManagerKindFilter.value) return false
    if (!keyword) return true
    return [
      group.model,
      modelKindLabel(group.kind),
      ...group.profiles.map((profile) => apiChannelName(profile)),
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword))
  })
})
const autoRouteGroupCount = computed(() => savedApiRouteGroups.value.filter((group) => group.profiles.length > 1).length)
const savedApiChannelEntries = computed<ApiChannelEntry[]>(() => {
  const groups = new Map<string, ModelProfile[]>()
  for (const profile of managedModels.value) {
    const endpoint = normalizedEndpoint(profile.endpoint).toLowerCase()
    const key = endpoint ? `${profile.provider}:${endpoint}` : `${profile.provider}:profile:${profile.id}`
    groups.set(key, [...(groups.get(key) ?? []), profile])
  }

  return Array.from(groups.entries()).map(([key, profiles]) => {
    const sortedProfiles = sortApiChannelProfiles(profiles)
    const profile = sortedProfiles[0]
    return {
      key,
      profile,
      profiles: sortedProfiles,
      name: apiChannelName(profile),
    }
  })
})
const activeApiChannelEntry = computed(() => {
  return savedApiChannelEntries.value.find((entry) => entry.profiles.some((profile) => profile.id === selectedRouteProfileId.value))
    ?? savedApiChannelEntries.value[0]
})
const modelEditorTitle = computed(() => {
  return store.models.some((model) => model.id === editingModelId.value) ? t('settings.modalTitleEdit') : t('settings.modalTitleNew')
})

type ModelStatusTone = 'ok' | 'warn' | 'error'

function promptCategoryLabel(category?: string): string {
  const map: Record<string, string> = {
    ICON: '图标',
    'Use GPT Image2 API': 'GPT 图像 API',
    'Use GPT Image 2 API': 'GPT 图像 API',
    'E-commerceCaes': '电商案例',
    'E-commerceCases': '电商案例',
  }
  return map[category ?? ''] ?? category ?? t('settings.categoryUncategorized')
}

function defaultApiPath(kind: ModelCatalogEntry['kind'] | ModelProfile['kind']): string {
  const runtimeKind = kind === 'unknown' ? draft.value.kind : kind
  if (runtimeKind === 'text') return textProtocolOptions[0].path
  if (runtimeKind === 'video') return videoProtocolOptions[0].path
  if (runtimeKind === 'tts') return ttsProtocolOptions[0].path
  return 'v1/images/generations'
}

function defaultApiProtocol(kind: ModelCatalogEntry['kind'] | ModelProfile['kind']): NonNullable<ModelProfile['apiProtocol']> {
  const runtimeKind = kind === 'unknown' ? draft.value.kind : kind
  if (runtimeKind === 'text') return 'openai-chat'
  if (runtimeKind === 'video') return 'agnes-video'
  if (runtimeKind === 'tts') return 'openai-audio-speech'
  return 'openai-images'
}

function allProtocolOptions(): ProtocolOption[] {
  return [
    ...textProtocolOptions,
    ...imageProtocolOptions,
    ...videoProtocolOptions,
    ...ttsProtocolOptions,
  ]
}

function apiPathForProtocol(protocol: NonNullable<ModelProfile['apiProtocol']>, kind: ModelCatalogEntry['kind'] | ModelProfile['kind'] = draft.value.kind): string {
  return allProtocolOptions().find((option) => option.value === protocol)?.path ?? defaultApiPath(kind)
}

function inferApiProtocol(kind: ModelCatalogEntry['kind'] | ModelProfile['kind'] = draft.value.kind, endpoint = draft.value.endpoint, apiPath = draft.value.apiPath): NonNullable<ModelProfile['apiProtocol']> {
  const runtimeKind = kind === 'unknown' ? draft.value.kind : kind
  const normalizedEndpoint = endpoint.trim().toLowerCase()
  const normalizedPath = apiPath?.trim().toLowerCase() ?? ''
  if (normalizedEndpoint.includes('agnes') || channelPresetId.value === 'agnes') {
    if (runtimeKind === 'video') return 'agnes-video'
    if (runtimeKind === 'image') return 'agnes-image'
  }
  if (runtimeKind === 'text' && (normalizedEndpoint.includes('anthropic') || normalizedPath.includes('messages'))) return 'anthropic-messages'
  if (runtimeKind === 'image' && (normalizedEndpoint.includes('dashscope') || normalizedEndpoint.includes('aliyuncs'))) return 'dashscope-wanxiang'
  if (runtimeKind === 'image' && (normalizedEndpoint.includes('mgtv') || normalizedPath.includes('storyboard'))) return 'mgtv-storyboard'
  return defaultApiProtocol(runtimeKind)
}

function syncAutoApiType(): void {
  const protocol = inferApiProtocol()
  draft.value.apiProtocol = protocol
  draft.value.apiPath = apiPathForProtocol(protocol, draft.value.kind)
}

function applyDraftKind(kind: ModelProfile['kind']): void {
  draft.value.kind = kind
  syncAutoApiType()
}

function toggleModelManagerKindFilter(kind: ModelProfile['kind']): void {
  modelManagerKindFilter.value = modelManagerKindFilter.value === kind ? 'all' : kind
}

function applyDefaultModelKind(kind: ChannelDefaultModelKind): void {
  channelDefaultModelKind.value = kind
  if (kind === 'all') {
    syncAutoApiType()
  } else {
    applyDraftKind(kind)
  }
  if (remoteModelCatalog.value.length) setSelectedChannelModels(channelSelectableModelOptions.value)
}

function applyChannelPreset(presetId: ChannelPresetId): void {
  const preset = channelPresets.find((item) => item.id === presetId)
  if (!preset) return
  channelPresetId.value = preset.id
  draft.value.name = preset.name
  if (preset.id === 'openai') {
    channelBaseUrlPresetId.value = 'openai'
    draft.value.endpoint = preset.endpoint
    if (draft.value.kind === 'video') draft.value.kind = 'image'
  } else if (preset.id === 'agnes') {
    channelBaseUrlPresetId.value = 'agnes'
    draft.value.endpoint = preset.endpoint
    if (draft.value.kind !== 'video') draft.value.kind = 'image'
  } else {
    channelBaseUrlPresetId.value = 'custom'
    if (channelBaseUrlPresets.some((item) => item.endpoint && item.endpoint === draft.value.endpoint)) {
      draft.value.endpoint = ''
    }
  }
  syncAutoApiType()
}

function applyBaseUrlPreset(presetId: ChannelBaseUrlPresetId): void {
  const preset = channelBaseUrlPresets.find((item) => item.id === presetId)
  if (!preset) return
  channelBaseUrlPresetId.value = preset.id
  if (preset.endpoint) draft.value.endpoint = preset.endpoint
  if (preset.id === 'openai' || preset.id === 'agnes') {
    channelPresetId.value = preset.id
    draft.value.name = channelPresets.find((item) => item.id === preset.id)?.name ?? draft.value.name
  }
  syncAutoApiType()
}

function syncPresetStateFromModel(model: ModelProfile): void {
  const endpoint = model.endpoint.trim().toLowerCase()
  const name = model.name.trim().toLowerCase()
  if (name === 'openai' || endpoint.includes('api.openai.com')) {
    channelPresetId.value = 'openai'
    channelBaseUrlPresetId.value = 'openai'
  } else if (name === 'agnes' || endpoint.includes('agnes')) {
    channelPresetId.value = 'agnes'
    channelBaseUrlPresetId.value = 'agnes'
  } else {
    channelPresetId.value = 'third-party'
    channelBaseUrlPresetId.value = 'custom'
  }
}

function modelKindLabel(kind: ModelCatalogEntry['kind'] | ModelProfile['kind']): string {
  const labels: Record<string, string> = {
    image: t('settings.kind.image'),
    text: t('settings.kind.text'),
    tts: t('settings.kind.tts'),
    video: t('settings.kind.video'),
    unknown: t('settings.kind.unknown'),
  }
  return labels[kind] ?? kind
}

function channelDefaultKindLabel(): string {
  return channelDefaultModelKind.value === 'all' ? t('settings.modelsAll') : `${modelKindLabel(channelDefaultModelKind.value)}${t('settings.modelsAll')}`
}

function isModelTesting(id: string): boolean {
  return testingModelIds.value.has(id)
}

function routeCatalogUrl(model: ModelProfile): string {
  const endpoint = model.endpoint.trim()
  if (!endpoint) return t('settings.endpointNotConfigured')
  return `${endpoint.replace(/\/+$/g, '')}/v1/models`
}

function endpointPresetId(endpoint: string): Extract<ChannelPresetId, 'openai' | 'agnes'> | '' {
  const normalized = normalizedEndpoint(endpoint).toLowerCase()
  const preset = channelBaseUrlPresets.find((item) => item.endpoint && normalizedEndpoint(item.endpoint).toLowerCase() === normalized)
  return preset?.id === 'openai' || preset?.id === 'agnes' ? preset.id : ''
}

function endpointChannelName(endpoint: string): string {
  const presetId = endpointPresetId(endpoint)
  return presetId ? channelPresets.find((item) => item.id === presetId)?.name ?? '' : ''
}

function resolvedDraftChannelName(): string {
  const endpointName = endpointChannelName(draft.value.endpoint)
  const typedName = draft.value.name.trim()
  if (endpointName && (!typedName || typedName === t('settings.channelThirdParty') || channelBaseUrlPresetId.value !== 'custom')) return endpointName
  return typedName || channelPresets.find((preset) => preset.id === channelPresetId.value)?.name || endpointName || t('settings.channelThirdParty')
}

function apiChannelName(profile: ModelProfile): string {
  return endpointChannelName(profile.endpoint) || profile.name.trim() || t('settings.channelThirdParty')
}

function protocolTypeLabel(protocol: NonNullable<ModelProfile['apiProtocol']>): string {
  if (protocol.startsWith('openai')) return 'openai'
  if (protocol.startsWith('agnes')) return 'agnes'
  if (protocol === 'dashscope-wanxiang') return 'dashscope'
  if (protocol === 'mgtv-storyboard') return 'mgtv'
  if (protocol === 'anthropic-messages') return 'anthropic'
  return protocol
}

function apiTypeLabel(model: ModelProfile): string {
  return protocolTypeLabel(model.apiProtocol ?? defaultApiProtocol(model.kind))
}

function catalogApiTypeLabel(model: ModelCatalogEntry): string {
  return protocolTypeLabel(model.apiProtocol)
}

function apiRouteStatusClass(model: ModelProfile): string {
  return `api-status-${modelStatusMeta(model).tone}`
}

function routeResponseLabel(model: ModelProfile): string {
  if (!model.lastCheckedAt) return t('settings.routeStatus.pending')
  const date = new Date(model.lastCheckedAt)
  if (Number.isNaN(date.getTime())) return t('settings.responseInspected')
  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function apiChannelStatusProfile(entry: ApiChannelEntry): ModelProfile {
  return entry.profiles.find((profile) => profile.status === 'connected')
    ?? entry.profiles.find((profile) => profile.status === 'untested')
    ?? entry.profile
}

function apiChannelStatusLabel(entry: ApiChannelEntry): string {
  if (entry.profiles.some((profile) => profile.status === 'connected')) return t('settings.channelEnabled')
  if (entry.profiles.every((profile) => modelStatusMeta(profile).tone === 'error')) return t('settings.channelDisabled')
  return modelStatusMeta(apiChannelStatusProfile(entry)).label
}

function apiChannelStatusClass(entry: ApiChannelEntry): string {
  if (entry.profiles.some((profile) => profile.status === 'connected')) return 'api-status-ok'
  if (entry.profiles.every((profile) => modelStatusMeta(profile).tone === 'error')) return 'api-status-error'
  return apiRouteStatusClass(apiChannelStatusProfile(entry))
}

function apiChannelResponseLabel(entry: ApiChannelEntry): string {
  const checkedProfiles = entry.profiles
    .filter((profile) => profile.lastCheckedAt)
    .sort((left, right) => new Date(right.lastCheckedAt ?? '').getTime() - new Date(left.lastCheckedAt ?? '').getTime())
  return checkedProfiles[0] ? routeResponseLabel(checkedProfiles[0]) : '未检测'
}

function apiChannelTypeLabel(entry: ApiChannelEntry): string {
  const presetId = endpointPresetId(entry.profile.endpoint)
  if (presetId) return presetId
  return Array.from(new Set(entry.profiles.map(apiTypeLabel))).join(' / ')
}

function apiChannelModelCountLabel(entry: ApiChannelEntry): string {
  const enabledCount = entry.profiles.filter((profile) => modelStatusMeta(profile).tone !== 'error').length
  return `${enabledCount} / ${entry.profiles.length}`
}

function apiChannelModelSummary(entry: ApiChannelEntry): string {
  const kinds = Array.from(new Set(entry.profiles.map((profile) => modelKindLabel(profile.kind))))
  return t('settings.channelSummary', { kinds: kinds.join(' / '), n: entry.profiles.length })
}

function modelRouteGroupPrimaryProfile(group: ModelRouteGroup): ModelProfile | undefined {
  return group.profiles[0]
}

function modelRouteGroupChannelNames(group: ModelRouteGroup): string[] {
  return Array.from(new Set(group.profiles.map(apiChannelName)))
}

function modelRouteGroupStatusLabel(group: ModelRouteGroup): string {
  if (group.profiles.some((profile) => profile.status === 'connected')) return t('settings.routeStatus.available')
  if (group.profiles.every((profile) => modelStatusMeta(profile).tone === 'error')) return t('settings.routeStatus.unavailable')
  return t('settings.routeStatus.pending')
}

function modelRouteGroupStatusClass(group: ModelRouteGroup): string {
  if (group.profiles.some((profile) => profile.status === 'connected')) return 'api-status-ok'
  if (group.profiles.every((profile) => modelStatusMeta(profile).tone === 'error')) return 'api-status-error'
  return 'api-status-warn'
}

function modelRouteGroupMetaLine(group: ModelRouteGroup): string {
  const connectedCount = group.profiles.filter((profile) => profile.status === 'connected').length
  const fallbackLabel = group.profiles.length > 1 ? t('settings.autoFallback') : t('settings.singleUpstreamRoute')
  const primaryProfile = modelRouteGroupPrimaryProfile(group)
  const primaryChannel = primaryProfile ? apiChannelName(primaryProfile) : t('settings.noUpstreams')
  return t('settings.metaLine', {
    kind: modelKindLabel(group.kind),
    n: group.profiles.length,
    m: connectedCount,
    channel: primaryChannel,
    fallback: fallbackLabel,
  })
}

function modelRouteGroupChannelSummary(group: ModelRouteGroup): string {
  const names = modelRouteGroupChannelNames(group)
  if (!names.length) return t('settings.noUpstreams')
  if (names.length <= 2) return names.join(' / ')
  return `${names.slice(0, 2).join(' / ')} ${t('settings.moreUpstreams', { n: names.length - 2 })}`
}

function sortApiChannelProfiles(profiles: ModelProfile[]): ModelProfile[] {
  return profiles.slice().sort((left, right) => {
    const leftSelected = selectedRouteProfileId.value && left.id === selectedRouteProfileId.value ? 0 : 1
    const rightSelected = selectedRouteProfileId.value && right.id === selectedRouteProfileId.value ? 0 : 1
    if (leftSelected !== rightSelected) return leftSelected - rightSelected
    if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1
    if (left.status !== right.status) {
      if (left.status === 'connected') return -1
      if (right.status === 'connected') return 1
    }
    return left.model.localeCompare(right.model)
  })
}

function selectApiChannel(entry: ApiChannelEntry): void {
  selectedRouteProfileId.value = entry.profile.id
}

function removeApiChannelWithConfirmation(entry: ApiChannelEntry): void {
  const confirmed = window.confirm(t('settings.confirmDeleteChannel', { name: entry.name, n: entry.profiles.length }))
  if (!confirmed) return

  for (const profile of entry.profiles) store.removeModel(profile.id)
  if (entry.profiles.some((profile) => editingModelId.value === profile.id)) closeModelEditor()
}

function resetChannelEditorState(model: ModelProfile): void {
  channelRemark.value = model.note ?? ''
  apiKeyVisible.value = false
  channelDefaultModelKind.value = 'all'
  selectedCatalogModelIds.value = model.model.trim() ? new Set([model.model]) : new Set()
  modelCatalogSearch.value = ''
  modelCatalogNotice.value = ''
  remoteModelCatalog.value = []
  syncPresetStateFromModel(model)
  syncAutoApiType()
}

function applyChannelModelToDraft(item: ModelCatalogEntry): void {
  draft.value.model = item.model
  if (item.kind !== 'unknown') {
    draft.value.kind = item.kind
    draft.value.apiPath = item.apiPath
    draft.value.apiProtocol = item.apiProtocol
  }
}

function setSelectedChannelModels(items: ModelCatalogEntry[]): void {
  selectedCatalogModelIds.value = new Set(items.map((item) => item.model))
  if (items[0]) applyChannelModelToDraft(items[0])
  else draft.value.model = ''
}

function toggleChannelModel(item: ModelCatalogEntry, event: Event): void {
  const checked = event.target instanceof HTMLInputElement ? event.target.checked : false
  const next = new Set(selectedCatalogModelIds.value)
  if (checked) next.add(item.model)
  else next.delete(item.model)
  selectedCatalogModelIds.value = next
  const selected = channelModelOptions.value.filter((option) => next.has(option.model))
  if (selected[0]) applyChannelModelToDraft(selected[0])
  else draft.value.model = ''
}

function selectAllChannelModels(): void {
  setSelectedChannelModels(channelSelectableModelOptions.value)
}

function clearChannelModelSelection(): void {
  setSelectedChannelModels([])
}

async function testModelConnection(id: string): Promise<void> {
  if (isModelTesting(id)) return

  testingModelIds.value = new Set([...testingModelIds.value, id])
  try {
    await store.testModel(id)
  } finally {
    const next = new Set(testingModelIds.value)
    next.delete(id)
    testingModelIds.value = next
  }
}

function newModel(kind: ModelProfile['kind'] = 'image'): void {
  const defaultName = kind === 'text'
    ? t('settings.newModel.text')
    : kind === 'video'
      ? t('settings.newModel.video')
      : kind === 'tts'
        ? t('settings.newModel.tts')
        : t('settings.newModel.image')
  draft.value = {
    id: createId('model'),
    name: defaultName,
    provider: 'openai-compatible',
    endpoint: '',
    apiPath: defaultApiPath(kind),
    apiProtocol: defaultApiProtocol(kind),
    apiKey: '',
    apiSecret: '',
    headersJson: '',
    note: '',
    model: '',
    kind,
    isPrimary: false,
    status: 'untested',
  }
  resetChannelEditorState(draft.value)
  applyChannelPreset('third-party')
  editingModelId.value = draft.value.id
}

function editModel(model: ModelProfile): void {
  draft.value = { ...model }
  resetChannelEditorState(model)
  editingModelId.value = model.id
}

function normalizedEndpoint(value: string): string {
  return value.trim().replace(/\/+$/g, '')
}

function existingModelForCatalogItem(item: ModelCatalogEntry): ModelProfile | undefined {
  const endpoint = normalizedEndpoint(draft.value.endpoint)
  return store.models.find((model) => (
    model.model.trim() === item.model
    && normalizedEndpoint(model.endpoint) === endpoint
  ))
}

function modelProfileFromCatalogItem(item: ModelCatalogEntry): ModelProfile {
  const kind = item.kind === 'unknown' ? draft.value.kind : item.kind
  const apiProtocol = item.kind === 'unknown' ? inferApiProtocol(kind, draft.value.endpoint, draft.value.apiPath) : item.apiProtocol
  const apiPath = item.kind === 'unknown' ? apiPathForProtocol(apiProtocol, kind) : item.apiPath
  const existing = existingModelForCatalogItem(item)

  return {
    ...draft.value,
    id: existing?.id ?? createId('model'),
    name: resolvedDraftChannelName(),
    model: item.model,
    kind,
    apiProtocol,
    apiPath,
    isPrimary: existing?.isPrimary ?? false,
    status: draft.value.status,
    lastCheckedAt: draft.value.lastCheckedAt,
    headersJson: '',
    note: channelRemark.value.trim(),
  }
}

function saveDraft(): void {
  if (!draft.value.name.trim()) {
    store.notify(t('settings.notifyModelNameRequired'), 'error')
    return
  }
  syncAutoApiType()
  if (remoteModelCatalog.value.length) {
    const profiles = selectedChannelModels.value.map((item) => modelProfileFromCatalogItem(item))
    store.replaceModelsForEndpoint(draft.value.endpoint, profiles, t('settings.notifySyncedModels', { n: profiles.length }))
    closeModelEditor()
    return
  }

  store.saveModel({ ...draft.value, headersJson: '', note: channelRemark.value.trim() })
  closeModelEditor()
}

function closeModelEditor(): void {
  editingModelId.value = ''
}

async function refreshChannelModelCatalog(): Promise<void> {
  syncAutoApiType()
  selectedCatalogModelIds.value = new Set()
  modelCatalogNotice.value = ''
  remoteModelCatalog.value = []

  modelCatalogLoading.value = true
  try {
    const remoteModels = await store.fetchModelCatalog({ ...draft.value })
    remoteModelCatalog.value = remoteModels.map((item) => ({
      ...item,
      model: item.id,
      provider: 'openai-compatible',
      endpoint: draft.value.endpoint,
      apiProtocol: inferApiProtocol(item.kind, draft.value.endpoint, draft.value.apiPath),
      apiPath: apiPathForProtocol(inferApiProtocol(item.kind, draft.value.endpoint, draft.value.apiPath), item.kind),
    }))
    if (remoteModelCatalog.value.length) setSelectedChannelModels(channelSelectableModelOptions.value)
    draft.value.status = remoteModels.length ? 'connected' : 'failed'
    draft.value.lastCheckedAt = new Date().toISOString()
    modelCatalogNotice.value = remoteModels.length
      ? t('settings.notifyFetchedModels', { total: remoteModels.length, selected: selectedChannelModelCount.value, kind: channelDefaultKindLabel() })
      : t('settings.notifyCatalogEmpty')
  } catch (error) {
    draft.value.status = 'failed'
    draft.value.lastCheckedAt = new Date().toISOString()
    modelCatalogNotice.value = error instanceof Error ? error.message : t('settings.notifyCatalogFetchFailed')
  } finally {
    modelCatalogLoading.value = false
  }
}

function importFile(event: Event): void {
  const input = event.target as HTMLInputElement
  importPromptFiles(Array.from(input.files ?? []))
  input.value = ''
}

function importPromptFiles(files: File[]): void {
  if (!files.length) return

  Promise.all(files.map(readPromptFile))
    .then((items) => store.importPromptBatch(items))
    .catch((error: unknown) => {
      store.notify(error instanceof Error ? error.message : t('settings.notifyImportPromptsFailed'), 'error')
    })
}

function readPromptFile(file: File): Promise<{ content: string; filename: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve({ content: String(reader.result), filename: file.name })
    reader.onerror = () => reject(new Error(t('settings.notifyReadFileFailed', { file: file.name })))
    reader.readAsText(file)
  })
}

function handlePromptDragOver(event: DragEvent): void {
  event.preventDefault()
  promptImportDragging.value = true
}

function handlePromptDragLeave(): void {
  promptImportDragging.value = false
}

function handlePromptDrop(event: DragEvent): void {
  event.preventDefault()
  promptImportDragging.value = false
  importPromptFiles(Array.from(event.dataTransfer?.files ?? []))
}

function exportPrompts(): void {
  const blob = new Blob([JSON.stringify(store.prompts, null, 2)], { type: 'application/json' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.href = url
  link.download = 'samimage-v3-prompts.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
  store.notify(t('settings.notifyPromptsExported'))
}

async function copyPrompt(item: PromptItem): Promise<void> {
  await navigator.clipboard?.writeText(item.prompt)
  store.notify(t('settings.notifyPromptCopied'))
}

function removePromptWithConfirmation(item: PromptItem): void {
  if (item.source === 'builtin') return
  const confirmed = window.confirm(t('settings.confirmDeletePrompt', { title: item.title }))
  if (!confirmed) return

  store.removePrompt(item.id)
}

function usePromptInWorkspace(item: PromptItem): void {
  store.usePrompt(item)
  void router.push({
    path: '/workspace',
    query: {
      mode: item.category === '封面' ? 'cover' : item.category === 'ICON' ? 'icon' : 'txt2img',
      prompt: item.prompt,
    },
  })
}

function toggleCoverPreset(id: string, event: Event): void {
  const input = event.target as HTMLInputElement
  store.setCoverPresetEnabled(id, input.checked)
}

function removeCoverPresetWithConfirmation(preset: { id: string; name: string }): void {
  const confirmed = window.confirm(t('settings.confirmDeleteCoverPreset', { name: preset.name }))
  if (!confirmed) return

  store.removeCoverPreset(preset.id)
}

function resetCoverPresetsWithConfirmation(): void {
  const confirmed = window.confirm(t('settings.confirmResetCovers'))
  if (!confirmed) return

  store.resetCoverPresets()
}

function openCoverPresetModal(): void {
  coverPresetName.value = ''
  coverPresetWidth.value = 1080
  coverPresetHeight.value = 608
  coverPresetEnabled.value = true
  coverPresetModalOpen.value = true
}

function addCoverPresetFromSettings(): void {
  const name = coverPresetName.value.trim()
  if (!name) {
    store.notify(t('settings.confirmAddPresetName'), 'error')
    return
  }

  const saved = store.addCoverPreset({
    name,
    width: coverPresetWidth.value,
    height: coverPresetHeight.value,
    enabled: coverPresetEnabled.value,
  })
  if (!saved) return

  coverPresetModalOpen.value = false
}

async function resetDemoDataWithConfirmation(): Promise<void> {
  const confirmed = window.confirm(t('settings.confirmResetData'))
  if (!confirmed) return

  await store.resetDemoData()
}

function logoutAccount(): void {
  store.logout()
  void router.replace('/login')
}

function modelStatusMeta(model: ModelProfile): { label: string; tone: ModelStatusTone } {
  if (!model.endpoint.trim() || !model.apiKey.trim() || (model.apiProtocol === 'mgtv-storyboard' && !model.apiSecret?.trim()) || !model.model.trim()) return { label: t('settings.status.unconfigured'), tone: 'warn' }
  if (model.status === 'connected') return { label: t('settings.status.connected'), tone: 'ok' }
  if (model.status === 'failed') return { label: t('settings.status.failed'), tone: 'error' }
  return { label: t('settings.status.pending'), tone: 'warn' }
}
</script>

<template>
  <div class="page-wide">
    <div class="page-header">
      <div>
        <p class="page-kicker">Settings Center</p>
        <h1 class="page-title">{{ t('settings.title') }}</h1>
        <p class="page-desc">{{ t('settings.desc') }}</p>
      </div>
      <div class="page-header-actions">
        <LocaleSwitcher />
        <button class="btn-primary" type="button" @click="store.saveSettings(store.settings)">
          <Save :size="16" />
          {{ t('settings.saveSettings') }}
        </button>
      </div>
    </div>

    <div class="settings-tabs">
      <button class="settings-tab" :class="{ active: activeTab === 'models' }" type="button" @click="activeTab = 'models'">{{ t('settings.tabModels') }}</button>
      <button class="settings-tab" :class="{ active: activeTab === 'prompts' }" type="button" @click="activeTab = 'prompts'">{{ t('settings.tabPrompts') }}</button>
      <button class="settings-tab" :class="{ active: activeTab === 'generation' }" type="button" @click="activeTab = 'generation'">{{ t('settings.tabGeneration') }}</button>
      <button class="settings-tab" :class="{ active: activeTab === 'system' }" type="button" @click="activeTab = 'system'">{{ t('settings.tabSystem') }}</button>
    </div>

    <section v-if="activeTab === 'models'" class="settings-section model-console-section">
      <div class="model-config-console" data-testid="cc-switch-model-config">
        <div class="model-console-header">
          <div class="model-console-brand">
            <strong>gotbot</strong>
            <span>{{ t('settings.modelConsoleDesc') }}</span>
          </div>
          <div class="model-console-summary">
            <span class="model-console-toggle">
              <i />
              {{ t('settings.autoRoute') }}
            </span>
            <span class="model-console-stat">{{ t('settings.managedModelCount', { n: managedModelCount }) }}</span>
            <span class="model-console-stat">{{ t('settings.channelCount', { n: savedApiChannelEntries.length }) }}</span>
          </div>
          <div class="model-console-actions" aria-label="渠道操作">
            <button class="console-add-button console-add-channel-button" type="button" @click="newModel('image')" :aria-label="t('settings.addChannel')">
              <Plus :size="16" />
              {{ t('settings.addChannel') }}
            </button>
          </div>
        </div>

        <div class="settings-section-block model-management-panel" data-testid="model-management-panel">
          <div class="model-management-head">
            <div class="settings-section-title">
              {{ t('settings.modelManagement') }}
              <span class="count">{{ t('settings.managementSummary', { n: managedModelCount, m: managedProfileCount }) }}</span>
            </div>
          </div>

          <div class="model-management-toolbar">
            <input
              v-model="modelManagerSearch"
              type="search"
              :placeholder="t('settings.searchPlaceholder')"
              :aria-label="t('settings.searchModelAria')"
            />
            <div class="model-kind-tabs" :aria-label="t('settings.kindFilterAria')">
              <button
                v-for="tab in modelManagerKindTabs"
                :key="tab.value"
                type="button"
                :class="{ active: modelManagerKindFilter === tab.value }"
                @click="toggleModelManagerKindFilter(tab.value)"
              >
                {{ tab.label }}
              </button>
            </div>
          </div>

          <div class="model-management-list" data-testid="managed-model-list">
            <article
              v-for="group in filteredManagedModelGroups"
              :key="group.key"
              class="model-management-row"
              :class="{ primary: group.profiles.some((profile) => profile.isPrimary) }"
              data-testid="managed-model-row"
            >
              <span class="model-provider-avatar" aria-hidden="true">{{ modelKindLabel(group.kind).slice(0, 1) }}</span>
              <div class="model-row-main">
                <div class="model-row-title">
                  <strong>{{ group.model }}</strong>
                  <span class="model-provider-name">{{ modelKindLabel(group.kind) }}</span>
                  <span v-if="group.profiles.length > 1" class="model-primary-badge">{{ t('settings.autoFallback') }}</span>
                  <span class="api-status-badge" :class="modelRouteGroupStatusClass(group)">{{ modelRouteGroupStatusLabel(group) }}</span>
                </div>
                <p>{{ modelRouteGroupMetaLine(group) }}</p>
              </div>
              <div class="model-route-summary" :aria-label="t('settings.colUpstreams')">
                <strong>{{ group.profiles.length }} {{ t('settings.upstreamUnit') }}</strong>
                <span>{{ modelRouteGroupChannelSummary(group) }}</span>
              </div>
            </article>
            <div v-if="!filteredManagedModelGroups.length" class="empty-inline">
              <strong>{{ t('settings.emptyMatch') }}</strong>
              <span>{{ t('settings.emptyMatchDesc') }}</span>
            </div>
          </div>
        </div>

        <div class="settings-section-block api-route-panel" data-testid="api-route-groups">
          <div class="settings-section-title">
            {{ t('settings.apiChannels') }}
            <span class="count">{{ t('settings.apiChannelsSummary', { n: savedApiChannelEntries.length, m: managedProfileCount, k: autoRouteGroupCount }) }}</span>
          </div>
          <div v-if="savedApiChannelEntries.length" class="api-switch-table-wrap">
            <table class="api-switch-table" data-testid="api-channel-table">
              <thead>
                <tr>
                  <th>{{ t('settings.colChannelName') }}</th>
                  <th>{{ t('settings.colApiType') }}</th>
                  <th>{{ t('settings.colBaseUrl') }}</th>
                  <th>{{ t('settings.colStatus') }}</th>
                  <th>{{ t('settings.colResponse') }}</th>
                  <th>{{ t('settings.colModelCount') }}</th>
                  <th>{{ t('settings.colActions') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="entry in savedApiChannelEntries"
                  :key="entry.key"
                  :class="{ active: activeApiChannelEntry?.key === entry.key }"
                >
                  <td>
                    <div class="api-channel-name">
                      <strong>{{ entry.name }}</strong>
                      <span>{{ apiChannelModelSummary(entry) }}</span>
                    </div>
                  </td>
                  <td><span class="api-type-pill">{{ apiChannelTypeLabel(entry) }}</span></td>
                  <td><span class="api-base-url">{{ routeCatalogUrl(entry.profile) }}</span></td>
                  <td><span class="api-status-badge" :class="apiChannelStatusClass(entry)">{{ apiChannelStatusLabel(entry) }}</span></td>
                  <td><span class="api-response-text">{{ apiChannelResponseLabel(entry) }}</span></td>
                  <td><span class="api-model-count">{{ apiChannelModelCountLabel(entry) }}</span></td>
                  <td>
                    <div class="api-table-actions">
                      <button
                        class="btn-soft btn-sm"
                        type="button"
                        :disabled="activeApiChannelEntry?.key === entry.key"
                        @click="selectApiChannel(entry)"
                      >
                        {{ activeApiChannelEntry?.key === entry.key ? t('settings.current') : t('settings.choose') }}
                      </button>
                      <button class="btn-soft btn-sm" type="button" @click="editModel(entry.profile)">{{ t('settings.edit') }}</button>
                      <button
                        class="btn-soft btn-sm model-test-button"
                        :class="{ loading: isModelTesting(entry.profile.id) }"
                        type="button"
                        :disabled="isModelTesting(entry.profile.id)"
                        :aria-busy="isModelTesting(entry.profile.id)"
                        @click="testModelConnection(entry.profile.id)"
                      >
                        {{ isModelTesting(entry.profile.id) ? t('settings.testing') : t('settings.test') }}
                      </button>
                      <button class="btn-danger btn-sm" type="button" @click="removeApiChannelWithConfirmation(entry)">{{ t('settings.delete') }}</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="empty-inline">
            <strong>{{ t('settings.emptyChannels') }}</strong>
            <span>{{ t('settings.emptyChannelsDesc') }}</span>
          </div>
        </div>
      </div>
    </section>

    <section v-else-if="activeTab === 'prompts'" class="settings-section">
      <div class="section-head">
        <h2>{{ t('settings.promptsMarket') }}</h2>
        <div class="btn-row">
          <button class="btn-soft btn-sm" type="button" @click="exportPrompts">
            <Download :size="14" />
            {{ t('settings.exportJson') }}
          </button>
        </div>
      </div>
      <label
        class="import-area"
        :class="{ dragging: promptImportDragging }"
        @dragover="handlePromptDragOver"
        @dragleave="handlePromptDragLeave"
        @drop="handlePromptDrop"
      >
        <Upload :size="22" />
        <span class="big">{{ t('settings.importDrag') }}</span>
        <span>{{ t('settings.importDragDesc') }}</span>
        <input type="file" accept="application/json,.json" multiple hidden @change="importFile" />
      </label>
      <div class="prompt-summary">
        <div class="stat-card"><strong>{{ store.prompts.length }}</strong><span>{{ t('settings.promptTotal') }}</span></div>
        <div class="stat-card"><strong>{{ promptSources.length }}</strong><span>{{ t('settings.promptSources') }}</span></div>
        <div class="stat-card"><strong>{{ filteredPrompts.length }}</strong><span>{{ t('settings.promptHits') }}</span></div>
      </div>
      <div class="sync-panel card">
        <div class="card-body stack">
          <div>
            <h3>{{ t('settings.syncRepoTitle') }}</h3>
            <p class="muted">{{ t('settings.syncRepoDesc') }}</p>
          </div>
          <div class="sync-grid">
            <article v-for="source in store.promptSyncSources" :key="source.key" class="sync-card">
              <div>
                <strong>{{ source.label }}</strong>
                <p class="muted">{{ source.repo }}</p>
              </div>
              <span class="chip">{{ store.promptSync[source.key]?.count ? t('settings.syncCount', { n: store.promptSync[source.key]?.count }) : t('settings.syncNotSynced') }}</span>
              <button class="btn-primary btn-sm" type="button" @click="store.syncPromptSource(source.key)">{{ t('settings.syncWith') }}-{{ source.label }}</button>
            </article>
          </div>
          <p class="muted">{{ t('settings.thanksNote') }}</p>
        </div>
      </div>
      <div class="prompt-filters">
        <div class="field prompt-search-field">
          <label for="prompt-market-search">{{ t('settings.searchPromptLabel') }}</label>
          <input id="prompt-market-search" v-model="promptSearch" :placeholder="t('settings.searchPromptPlaceholder')" />
        </div>
        <div class="field">
          <label for="prompt-origin-filter">{{ t('settings.promptTypeLabel') }}</label>
          <select id="prompt-origin-filter" v-model="promptOriginFilter">
            <option value="all">{{ t('settings.originAll') }}</option>
            <option value="imported">{{ t('settings.originImported') }}</option>
            <option value="builtin">{{ t('settings.originBuiltin') }}</option>
          </select>
        </div>
        <div class="field">
          <label for="prompt-source-filter">{{ t('settings.sourceFilterLabel') }}</label>
          <select id="prompt-source-filter" v-model="promptSourceFilter">
            <option value="all">{{ t('settings.sourceAll') }}</option>
            <option v-for="source in promptSources" :key="source" :value="source">{{ source }}</option>
          </select>
        </div>
        <div class="field">
          <label for="prompt-category-filter">{{ t('settings.categoryFilterLabel') }}</label>
          <select id="prompt-category-filter" v-model="promptCategoryFilter">
            <option value="all">{{ t('settings.categoryAll') }}</option>
            <option v-for="category in promptCategories" :key="category" :value="category">{{ promptCategoryLabel(category) }}</option>
          </select>
        </div>
      </div>
      <div class="card prompt-list-panel">
        <div class="prompt-list">
          <article v-for="item in filteredPrompts" :key="item.id" class="prompt-card">
            <div class="prompt-card-main">
              <div class="inline prompt-meta-line">
                <strong>{{ item.title }}</strong>
                <span class="chip">{{ item.source }}</span>
                <span v-if="item.category" class="chip accent">{{ promptCategoryLabel(item.category) }}</span>
                <span v-if="item.subCategory" class="chip">{{ promptCategoryLabel(item.subCategory) }}</span>
              </div>
              <p>{{ item.prompt }}</p>
              <small v-if="item.promptZh" class="prompt-zh">{{ item.promptZh }}</small>
              <div v-if="item.author" class="prompt-author">by {{ item.author }}</div>
            </div>
            <div class="prompt-actions">
              <button class="btn-primary btn-sm" type="button" @click="usePromptInWorkspace(item)">{{ t('settings.use') }}</button>
              <button class="btn-soft btn-sm" type="button" @click="copyPrompt(item)">{{ t('settings.copy') }}</button>
              <button v-if="item.source !== 'builtin'" class="btn-danger btn-sm" type="button" @click="removePromptWithConfirmation(item)">{{ t('settings.delete') }}</button>
              <span v-else class="builtin-note">{{ t('settings.builtin') }}</span>
            </div>
          </article>
          <EmptyState v-if="!filteredPrompts.length" :icon="FileText" :title="t('settings.emptyPromptsTitle')" :description="t('settings.emptyPromptsDesc')" />
        </div>
      </div>
    </section>

    <section v-else-if="activeTab === 'generation'" class="settings-section">
      <div class="card">
        <div class="card-body stack">
          <h2>{{ t('settings.generationParams') }}</h2>
          <div class="grid grid-2">
            <div class="field">
              <label for="default-generation-size">{{ t('settings.defaultSize') }}</label>
              <input id="default-generation-size" v-model.number="store.settings.defaultGenerationSize" type="number" min="128" max="4096" step="64" />
            </div>
            <div class="field">
              <label for="default-batch-size">{{ t('settings.defaultCount') }}</label>
              <select id="default-batch-size" v-model.number="store.settings.defaultBatchSize">
                <option :value="1">1</option>
                <option :value="2">2</option>
                <option :value="3">3</option>
                <option :value="4">4</option>
              </select>
            </div>
            <div class="field">
              <label for="default-style">{{ t('settings.defaultStyle') }}</label>
              <select id="default-style" v-model="store.settings.defaultStyle">
                <option v-for="item in stylePresets" :key="item" :value="item">{{ item }}</option>
              </select>
            </div>
            <div class="field">
              <label for="default-img-model">{{ t('settings.defaultImgModel') }}</label>
              <select id="default-img-model" v-model="store.settings.defaultImageModelId">
                <option v-for="model in store.imageModels" :key="model.id" :value="model.id">{{ model.name }} / {{ model.model }}</option>
              </select>
            </div>
          </div>
          <label class="toggle-line"><input v-model="store.settings.autoSaveHistory" type="checkbox" /> {{ t('settings.autoSaveHistory') }}</label>
          <label class="toggle-line"><input v-model="store.settings.includePromptMetadata" type="checkbox" /> {{ t('settings.includeMeta') }}</label>
          <button class="btn-primary" type="button" @click="store.saveSettings(store.settings)">{{ t('settings.saveGenParams') }}</button>
        </div>
      </div>
    </section>

    <section v-else class="settings-section">
      <div class="card">
        <div class="card-body stack">
          <h2>{{ t('settings.systemSettings') }}</h2>
          <div class="field">
            <label for="default-export-format">{{ t('settings.defaultExportFormat') }}</label>
            <select id="default-export-format" v-model="store.settings.defaultExportFormat">
              <option v-for="option in exportFormatOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </div>
          <div class="btn-row">
            <button class="btn-primary" type="button" @click="store.saveSettings(store.settings)">{{ t('settings.saveSystem') }}</button>
            <button class="btn-soft" type="button" @click="logoutAccount">{{ t('settings.logout') }}</button>
            <button class="btn-danger" type="button" @click="resetDemoDataWithConfirmation">{{ t('settings.resetData') }}</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-body stack">
          <div class="section-head">
            <div>
              <h2>{{ t('settings.coverPresets') }}</h2>
              <p class="muted">{{ t('settings.coverEnabledCount', { n: enabledCoverPresetCount }) }}</p>
            </div>
            <button class="btn-soft btn-sm" type="button" @click="resetCoverPresetsWithConfirmation">
              <RotateCcw :size="14" />
              {{ t('settings.resetCoverPresets') }}
            </button>
            <button class="btn-primary btn-sm" type="button" @click="openCoverPresetModal">
              <Plus :size="14" />
              {{ t('settings.addPreset') }}
            </button>
          </div>
          <div class="cover-settings-list">
            <article v-for="preset in store.coverPresets" :key="preset.id" class="cover-row">
              <div>
                <div class="inline">
                  <strong>{{ preset.name }}</strong>
                  <span v-if="preset.custom" class="chip accent">{{ t('settings.custom') }}</span>
                </div>
                <p class="muted">{{ preset.width }} x {{ preset.height }}</p>
              </div>
              <label class="toggle-line">
                <input
                  :checked="preset.enabled"
                  type="checkbox"
                  :aria-label="`${t('settings.enable')} ${preset.name}`"
                  @change="toggleCoverPreset(preset.id, $event)"
                />
                {{ t('settings.enable') }}
              </label>
              <button
                v-if="preset.custom"
                class="btn-icon"
                type="button"
                :aria-label="`${t('settings.delete')} ${preset.name}`"
                @click="removeCoverPresetWithConfirmation(preset)"
              >
                <Trash2 :size="14" />
              </button>
              <span v-else class="builtin-note">{{ t('settings.builtin') }}</span>
            </article>
          </div>
        </div>
      </div>
    </section>

    <div v-if="editingModelId" class="modal-overlay api-channel-modal-overlay" @click.self="closeModelEditor">
      <div class="modal api-channel-modal" data-testid="api-channel-editor-modal">
        <div class="modal-head api-channel-modal-head">
          <div>
            <h2>{{ modelEditorTitle }}</h2>
            <p class="muted">{{ t('settings.modalChannelDesc') }}</p>
          </div>
          <button class="btn-icon" type="button" @click="closeModelEditor">×</button>
        </div>

        <div class="modal-body api-channel-modal-body">
          <div class="field">
            <label for="model-draft-name-unified">{{ t('settings.channelName') }}</label>
            <select id="model-draft-name-unified" v-model="channelPresetId" @change="applyChannelPreset(channelPresetId)">
              <option v-for="preset in channelPresets" :key="preset.id" :value="preset.id">{{ preset.label }}</option>
            </select>
          </div>
          <div class="auto-api-type-card">
            <span>{{ t('settings.apiType') }}</span>
            <strong>{{ t('settings.autoDetect') }}</strong>
            <small>{{ autoApiTypeSummary }}</small>
          </div>
          <div class="field">
            <label for="model-draft-endpoint-unified">{{ t('settings.baseUrl') }}</label>
            <select id="model-draft-base-url-preset" v-model="channelBaseUrlPresetId" @change="applyBaseUrlPreset(channelBaseUrlPresetId)">
              <option v-for="preset in channelBaseUrlPresets" :key="preset.id" :value="preset.id">{{ preset.label }}{{ preset.endpoint ? ` · ${preset.endpoint}` : '' }}</option>
            </select>
            <div class="channel-input-with-status">
              <input id="model-draft-endpoint-unified" v-model="draft.endpoint" placeholder="https://your-relay.example.com" @blur="syncAutoApiType" />
              <span>✓ {{ routeResponseLabel(draft) }}</span>
            </div>
          </div>
          <div class="field">
            <label for="model-draft-api-key-unified">{{ t('settings.apiKey') }}</label>
            <div class="channel-api-key-row">
              <input
                id="model-draft-api-key-unified"
                v-model="draft.apiKey"
                :type="apiKeyVisible ? 'text' : 'password'"
                :placeholder="draft.apiProtocol === 'mgtv-storyboard' ? 'Access Key' : 'sk-...'"
              />
              <button class="btn-soft btn-sm" type="button" @click="apiKeyVisible = !apiKeyVisible">{{ apiKeyVisible ? t('settings.hide') : t('settings.show') }}</button>
            </div>
          </div>
          <div v-if="draft.apiProtocol === 'mgtv-storyboard'" class="field">
            <label for="model-draft-api-secret-unified">{{ t('settings.secretKey') }}</label>
            <input id="model-draft-api-secret-unified" v-model="draft.apiSecret" type="password" :placeholder="t('settings.secretKey')" />
          </div>

          <div class="field">
            <label for="model-draft-note-unified">{{ t('settings.remark') }}</label>
            <textarea id="model-draft-note-unified" v-model="channelRemark" rows="3" :placeholder="t('settings.remarkPlaceholder')" />
          </div>

          <div class="field">
            <label for="model-draft-kind-unified">{{ t('settings.defaultModelType') }}</label>
            <select id="model-draft-kind-unified" v-model="channelDefaultModelKind" @change="applyDefaultModelKind(channelDefaultModelKind)">
              <option value="all">{{ t('settings.allModels') }}</option>
              <option value="image">{{ t('settings.kind.image') }}</option>
              <option value="video">{{ t('settings.kind.video') }}</option>
              <option value="text">{{ t('settings.kind.text') }}</option>
              <option value="tts">{{ t('settings.kind.tts') }}</option>
            </select>
          </div>

          <button class="channel-fetch-button" type="button" :disabled="modelCatalogLoading" @click="refreshChannelModelCatalog">
            {{ modelCatalogLoading ? t('settings.fetchingModels') : t('settings.fetchModels') }}
          </button>
          <p v-if="modelCatalogNotice" class="muted channel-fetch-notice">{{ modelCatalogNotice }}</p>

          <div class="channel-model-panel">
            <div class="channel-model-window-tabs">
              <button type="button" :class="{ active: modelBenchmarkWindow === '3m' }" @click="modelBenchmarkWindow = '3m'">{{ t('settings.benchmark3m') }}</button>
              <button type="button" :class="{ active: modelBenchmarkWindow === '6m' }" @click="modelBenchmarkWindow = '6m'">{{ t('settings.benchmark6m') }}</button>
              <button type="button" :class="{ active: modelBenchmarkWindow === '12m' }" @click="modelBenchmarkWindow = '12m'">{{ t('settings.benchmark12m') }}</button>
            </div>
            <div class="channel-model-search-row">
              <input v-model="modelCatalogSearch" :placeholder="t('settings.searchOrCreateModel')" />
              <button class="btn-soft btn-sm" type="button" @click="selectAllChannelModels">{{ t('settings.selectAll') }}</button>
              <button class="btn-soft btn-sm" type="button" @click="clearChannelModelSelection">{{ t('settings.clear') }}</button>
            </div>
            <div class="channel-model-list">
              <template v-if="modelCatalogLoading">
                <div v-for="n in 4" :key="n" class="channel-model-skeleton">
                  <span class="skeleton skeleton-check" />
                  <span class="skeleton skeleton-line channel-model-skeleton-line" />
                </div>
              </template>
              <template v-else>
                <label v-for="item in channelModelOptions" :key="`${item.source}:${item.model}`" class="channel-model-option">
                  <input
                    type="checkbox"
                    :value="item.model"
                    :checked="selectedCatalogModelIds.has(item.model)"
                    @change="toggleChannelModel(item, $event)"
                  />
                  <span>{{ item.model }}</span>
                  <em>{{ catalogApiTypeLabel(item) }}</em>
                </label>
                <div v-if="!channelModelOptions.length" class="empty-inline channel-model-empty">
                  <strong>{{ t('settings.emptyModels') }}</strong>
                  <span>{{ t('settings.emptyModelsDesc') }}</span>
                </div>
              </template>
            </div>
            <div class="channel-model-footer">
              <span>{{ selectedChannelModelCount }} / {{ channelModelOptions.length }}</span>
              <button
                class="btn-soft btn-sm"
                type="button"
                :disabled="!store.models.some((model) => model.id === draft.id) || isModelTesting(draft.id)"
                @click="testModelConnection(draft.id)"
              >
                {{ t('settings.modelSpeedTest', { n: channelModelOptions.length }) }}
              </button>
            </div>
          </div>
        </div>

        <div class="modal-foot api-channel-modal-foot">
          <button class="btn-soft" type="button" @click="closeModelEditor">{{ t('common.cancel') }}</button>
          <button class="btn-primary" type="button" @click="saveDraft">{{ t('common.save') }}</button>
        </div>
      </div>
    </div>

    <div v-if="coverPresetModalOpen" class="modal-overlay" @click.self="coverPresetModalOpen = false">
      <div class="modal small">
        <div class="modal-head">
          <div>
            <h2>{{ t('settings.addCoverPresetTitle') }}</h2>
            <p class="muted">{{ t('settings.addCoverPresetDesc') }}</p>
          </div>
          <button class="btn-icon" type="button" @click="coverPresetModalOpen = false">×</button>
        </div>
        <div class="modal-body stack">
          <div class="field">
            <label for="settings-cover-preset-name">{{ t('settings.presetName') }}</label>
            <input id="settings-cover-preset-name" v-model="coverPresetName" :placeholder="t('settings.presetNamePlaceholder')" />
          </div>
          <div class="grid grid-2">
            <div class="field">
              <label for="settings-cover-preset-width">{{ t('settings.width') }}</label>
              <input id="settings-cover-preset-width" v-model.number="coverPresetWidth" type="number" min="128" max="4096" />
            </div>
            <div class="field">
              <label for="settings-cover-preset-height">{{ t('settings.height') }}</label>
              <input id="settings-cover-preset-height" v-model.number="coverPresetHeight" type="number" min="128" max="4096" />
            </div>
          </div>
          <label class="toggle-line">
            <input v-model="coverPresetEnabled" type="checkbox" :aria-label="t('settings.enable')" />
            {{ t('settings.enable') }}
          </label>
        </div>
        <div class="modal-foot">
          <button class="btn-soft" type="button" @click="coverPresetModalOpen = false">{{ t('common.cancel') }}</button>
          <button class="btn-primary" type="button" @click="addCoverPresetFromSettings">{{ t('settings.addPresetConfirm') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--border-soft);
  margin-bottom: 26px;
}

.page-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.settings-tab {
  padding: 10px 18px;
  color: var(--muted);
  border-bottom: 2px solid transparent;
}

.settings-tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
  font-weight: 700;
}

.settings-section {
  display: grid;
  gap: 22px;
}

.model-console-section {
  gap: 0;
}

.model-config-console {
  display: grid;
  gap: 14px;
  padding: 18px;
  border: 1px solid rgba(226, 214, 202, 0.78);
  border-radius: 28px;
  background:
    radial-gradient(circle at 25% 10%, rgba(255, 132, 78, 0.14), transparent 34%),
    linear-gradient(145deg, rgba(255, 248, 241, 0.92), rgba(250, 244, 238, 0.74));
  box-shadow: 0 26px 70px rgba(97, 54, 24, 0.13), var(--elev-raised);
}

.model-console-header {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto auto;
  align-items: center;
  gap: 14px;
  min-width: 0;
  padding: 14px 16px;
  border: 1px solid rgba(226, 214, 202, 0.82);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 12px 30px rgba(67, 43, 29, 0.08);
}

.model-console-brand {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.model-console-brand strong {
  color: #13a779;
  font-size: 20px;
  font-weight: 950;
  letter-spacing: -0.04em;
  line-height: 1;
}

.model-console-brand span {
  color: #7a6f66;
  font-size: 12px;
}

.model-console-summary {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.model-console-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex: 0 0 auto;
  min-height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  color: #6b625a;
  background: rgba(244, 239, 234, 0.96);
  font-size: 12px;
  font-weight: 800;
}

.model-console-toggle i {
  position: relative;
  width: 30px;
  height: 16px;
  border-radius: 999px;
  background: rgba(128, 134, 146, 0.28);
}

.model-console-toggle i::after {
  content: "";
  position: absolute;
  top: 2px;
  right: 2px;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: #335cff;
  box-shadow: 0 3px 8px rgba(51, 92, 255, 0.28);
}

.model-console-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.model-console-stat {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid rgba(224, 214, 204, 0.78);
  border-radius: 999px;
  color: #6b625a;
  background: rgba(255, 255, 255, 0.74);
  font-size: 12px;
  font-weight: 800;
}

.console-add-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 32px;
  border: 1px solid rgba(224, 214, 204, 0.94);
  color: #4b423b;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 8px 18px rgba(67, 43, 29, 0.06);
  font-size: 12px;
  font-weight: 800;
}

.console-add-button {
  min-width: 24px;
  min-height: 24px;
  border-radius: 8px;
  color: white;
  font-size: 12px;
  font-weight: 900;
}

.console-add-button {
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: linear-gradient(135deg, #ff7a45, #ff9b4a);
}

.model-console-section .settings-section-block {
  border: 1px solid rgba(226, 214, 202, 0.82);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.74);
  box-shadow: 0 12px 34px rgba(67, 43, 29, 0.07);
}

.model-console-section .settings-section-block {
  padding: 14px;
}

.settings-section-block {
  display: grid;
  gap: 12px;
}

.settings-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.settings-section-title::after {
  content: "";
  flex: 1 1 auto;
  height: 1px;
  background: var(--border-soft);
}

.settings-section-title .count {
  color: var(--accent);
  white-space: nowrap;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  min-width: 0;
}

.section-head h2,
.section-head > div {
  min-width: 0;
}

.model-card-badges {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

.model-card-head,
.model-card-body,
.model-actions,
.model-card-heading {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.model-card-head {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border-soft);
}

.model-card-heading h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 700;
  min-width: 0;
}

.model-card-heading h3,
.model-card-heading .muted {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--accent);
  flex: 0 0 auto;
}

.text-dot {
  background: var(--warn);
}

.primary-badge,
.set-primary-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.primary-badge {
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--border-glow);
}

.set-primary-btn {
  color: var(--muted);
  border: 1px solid var(--border);
  background: var(--tint);
}

.set-primary-btn:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.model-card,
.prompt-card {
  display: grid;
  gap: 12px;
  padding: 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  min-width: 0;
}

.api-channel-modal-overlay {
  background: rgba(17, 24, 39, 0.72);
}

.api-channel-modal {
  width: min(560px, calc(100vw - 32px));
  max-height: calc(100vh - 56px);
  overflow: hidden;
  border-radius: 14px;
  background: #fff;
  color: #111827;
}

.api-channel-modal-head,
.api-channel-modal-foot {
  padding: 14px 18px;
}

.api-channel-modal-head h2 {
  font-size: 16px;
  font-weight: 900;
}

.api-channel-modal-body {
  display: grid;
  gap: 12px;
  max-height: calc(100vh - 190px);
  overflow-y: auto;
  padding: 14px 18px;
}

.api-channel-modal .field {
  gap: 6px;
}

.channel-input-with-status,
.channel-api-key-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.channel-input-with-status input {
  border-color: rgba(16, 185, 129, 0.38);
}

.channel-input-with-status span {
  color: #10b981;
  font-size: 11px;
  font-weight: 900;
  white-space: nowrap;
}

.channel-model-window-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  overflow: hidden;
  border: 1px solid rgba(229, 231, 235, 0.95);
  border-radius: 8px;
}

.channel-model-window-tabs button {
  min-height: 30px;
  color: #4b5563;
  background: #fff;
  border-right: 1px solid rgba(229, 231, 235, 0.95);
  font-size: 11px;
  font-weight: 900;
}

.channel-model-window-tabs button:last-child {
  border-right: 0;
}

.channel-model-window-tabs button.active {
  color: #fff;
  background: #111;
}

.auto-api-type-card {
  padding: 10px 12px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 4px 10px;
  align-items: center;
  border: 1px solid rgba(229, 231, 235, 0.95);
  border-radius: 10px;
  background: #f9fafb;
}

.auto-api-type-card span {
  color: #6b7280;
  font-size: 12px;
  font-weight: 800;
}

.auto-api-type-card strong {
  color: #111827;
  font-size: 13px;
  font-weight: 900;
}

.auto-api-type-card small {
  grid-column: 1 / -1;
  color: #4b5563;
  font-size: 11px;
}

.api-channel-modal textarea {
  width: 100%;
  min-width: 0;
  resize: vertical;
}

.channel-fetch-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  width: 100%;
  border-radius: 8px;
  color: #fff;
  background: #111;
  font-weight: 900;
}

.channel-fetch-button:disabled {
  cursor: wait;
  opacity: 0.72;
}

.channel-fetch-notice {
  margin-top: -4px;
}

.channel-model-panel {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid rgba(229, 231, 235, 0.95);
  border-radius: 10px;
  background: rgba(249, 250, 251, 0.68);
}

.channel-model-search-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 8px;
}

.channel-model-list {
  display: grid;
  min-height: 138px;
  max-height: 176px;
  overflow-y: auto;
  border: 1px solid rgba(229, 231, 235, 0.95);
  border-radius: 8px;
  background: #fff;
}

.channel-model-option {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 10px;
  border-bottom: 1px solid rgba(243, 244, 246, 0.95);
  color: #111827;
  font-size: 12px;
}

.channel-model-option:last-child {
  border-bottom: 0;
}

.channel-model-option span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.channel-model-option em {
  color: #6b7280;
  font-size: 10px;
  font-style: normal;
}

.channel-model-empty {
  min-height: 116px;
  border: 0;
  border-radius: 0;
}

.channel-model-skeleton {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 10px 4px;
  border-bottom: 1px solid var(--border-soft);
}

.skeleton-check {
  width: 16px;
  height: 16px;
  border-radius: var(--radius-sm);
}

.channel-model-skeleton-line {
  width: 60%;
}

.channel-model-footer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  color: #6b7280;
  font-size: 11px;
}

.api-channel-modal-foot {
  border-top: 1px solid rgba(229, 231, 235, 0.95);
}

.model-management-panel {
  gap: 14px;
}

.model-management-head {
  display: flex;
  align-items: center;
  min-width: 0;
}

.model-management-toolbar {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.model-management-toolbar input {
  width: 100%;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid rgba(229, 231, 235, 0.95);
  border-radius: 10px;
  color: #111827;
  background: rgba(255, 255, 255, 0.94);
  font-size: 12px;
  outline: none;
}

.model-management-toolbar input:focus {
  border-color: rgba(17, 24, 39, 0.42);
  box-shadow: 0 0 0 3px rgba(17, 24, 39, 0.06);
}

.model-kind-tabs {
  display: inline-grid;
  grid-auto-flow: column;
  overflow: hidden;
  border: 1px solid rgba(229, 231, 235, 0.95);
  border-radius: 10px;
  background: rgba(249, 250, 251, 0.94);
}

.model-kind-tabs button {
  min-width: 70px;
  min-height: 34px;
  padding: 0 12px;
  color: #6b7280;
  border-right: 1px solid rgba(229, 231, 235, 0.95);
  font-size: 12px;
  font-weight: 800;
}

.model-kind-tabs button:last-child {
  border-right: 0;
}

.model-kind-tabs button.active {
  color: #111827;
  background: #fff;
  box-shadow: inset 0 -2px 0 #111827;
}

.model-management-list {
  display: grid;
  gap: 10px;
}

.model-management-row {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) minmax(150px, auto);
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 13px 14px;
  border: 1px solid rgba(229, 231, 235, 0.95);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.94);
  transition: border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease;
}

.model-management-row:hover,
.model-management-row.primary {
  border-color: rgba(16, 185, 129, 0.42);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
}

.model-management-row:hover {
  transform: translateY(-1px);
}

.model-provider-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid rgba(229, 231, 235, 0.96);
  border-radius: 10px;
  color: #111827;
  background: rgba(248, 250, 252, 0.98);
  font-size: 12px;
  font-weight: 900;
}

.model-row-main {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.model-row-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
  min-width: 0;
}

.model-row-title strong,
.model-row-main p {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-row-title strong {
  max-width: min(360px, 42vw);
  color: #111827;
  font-size: 13px;
  font-weight: 950;
}

.model-provider-name {
  color: #4b5563;
  font-size: 11px;
  font-weight: 800;
}

.model-primary-badge {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 7px;
  border-radius: 999px;
  color: #047857;
  background: rgba(16, 185, 129, 0.12);
  font-size: 11px;
  font-weight: 900;
}

.model-row-main p {
  max-width: 100%;
  color: #6b7280;
  font-size: 11px;
}

.model-route-summary {
  display: grid;
  justify-items: end;
  gap: 4px;
  color: #6b7280;
  font-size: 11px;
  font-weight: 800;
  text-align: right;
}

.model-route-summary strong {
  color: #111827;
  font-size: 12px;
  font-weight: 950;
}

.model-route-summary span {
  max-width: 190px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.api-route-panel {
  gap: 14px;
}

.api-switch-table-wrap {
  overflow-x: auto;
  border: 1px solid rgba(225, 229, 235, 0.92);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.92);
}

.api-switch-table {
  width: 100%;
  min-width: 880px;
  border-collapse: collapse;
  color: #1f2933;
  font-size: 12px;
}

.api-switch-table th,
.api-switch-table td {
  padding: 12px 14px;
  border-bottom: 1px solid rgba(229, 232, 238, 0.9);
  text-align: left;
  vertical-align: middle;
  white-space: nowrap;
}

.api-switch-table th {
  color: #4b5563;
  background: rgba(248, 250, 252, 0.96);
  font-size: 11px;
  font-weight: 900;
}

.api-switch-table tbody tr {
  transition: background 140ms ease;
}

.api-switch-table tbody tr:hover,
.api-switch-table tbody tr.active {
  background: rgba(236, 253, 245, 0.72);
}

.api-switch-table tbody tr:last-child td {
  border-bottom: 0;
}

.api-channel-name {
  display: grid;
  gap: 4px;
  min-width: 150px;
}

.api-channel-name strong,
.api-base-url {
  overflow: hidden;
  text-overflow: ellipsis;
}

.api-channel-name strong {
  max-width: 180px;
  color: #111827;
  font-size: 13px;
  font-weight: 900;
}

.api-channel-name span {
  color: #6b7280;
  font-size: 11px;
}

.api-type-pill,
.api-status-badge,
.api-model-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
}

.api-type-pill {
  color: #4b5563;
  background: rgba(243, 244, 246, 0.96);
}

.api-base-url {
  display: inline-block;
  max-width: 270px;
  color: #2563eb;
  font-family: var(--font-mono);
  font-size: 11px;
}

.api-status-badge.api-status-ok {
  color: #059669;
  background: rgba(16, 185, 129, 0.12);
}

.api-status-badge.api-status-warn {
  color: #9a6700;
  background: rgba(245, 158, 11, 0.14);
}

.api-status-badge.api-status-error {
  color: #6b7280;
  background: rgba(107, 114, 128, 0.12);
}

.api-response-text {
  color: #16a34a;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 800;
}

.api-model-count {
  color: #374151;
  background: rgba(249, 250, 251, 0.96);
}

.api-table-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.api-table-actions .btn-sm {
  min-height: 26px;
  padding-inline: 8px;
  font-size: 11px;
}

.model-test-button {
  min-width: 92px;
}

.model-test-button.loading,
.model-test-button:disabled {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-soft);
  cursor: wait;
  opacity: 0.92;
}

.model-test-button:disabled:hover {
  transform: none;
}

.spin-icon {
  animation: settings-spin 0.8s linear infinite;
}

@keyframes settings-spin {
  to {
    transform: rotate(360deg);
  }
}

.model-fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.field-value {
  min-height: 40px;
  display: flex;
  align-items: center;
  padding: 8px 11px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--tint);
  color: var(--fg-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-card {
  margin-top: 8px;
}

.inline-editor {
  display: grid;
  gap: 12px;
  padding: 14px;
  background: var(--tint);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-sm);
}

.inline-editor.card {
  margin-top: 10px;
  box-shadow: none;
}

.inline-editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.inline-editor-head h3 {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toggle-line {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--fg-2);
}

.editor-card .toggle-line {
  grid-column: 1 / -1;
  min-height: 34px;
}

.prompt-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.stat-card {
  padding: 18px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  display: grid;
}

.stat-card strong {
  font-size: 22px;
  color: var(--accent);
}

.stat-card span {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
}

.import-area {
  display: grid;
  place-items: center;
  gap: 7px;
  min-height: 118px;
  padding: 20px;
  color: var(--muted);
  text-align: center;
  cursor: pointer;
  background: var(--tint);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  transition: border-color 160ms ease, background 160ms ease, color 160ms ease;
}

.import-area:hover,
.import-area.dragging {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: var(--accent);
}

.import-area .big {
  color: var(--fg);
  font-weight: 800;
}

.sync-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 10px;
}

.sync-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 10px;
  padding: 14px;
  background: var(--tint);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  min-width: 0;
}

.sync-card strong,
.sync-card p {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sync-card .btn-primary {
  grid-column: 1 / -1;
  justify-self: start;
  max-width: 100%;
  white-space: normal;
  text-align: center;
}

.prompt-filters {
  display: grid;
  grid-template-columns: minmax(260px, 1.4fr) repeat(3, minmax(160px, 0.8fr));
  gap: 12px;
  align-items: end;
}

.prompt-search-field {
  min-width: 0;
}

.prompt-list {
  display: grid;
  gap: 10px;
}

.prompt-list-panel {
  overflow: hidden;
}

.prompt-card {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  border-radius: 0;
  border-inline: 0;
  border-top: 0;
  background: transparent;
  padding: 14px 20px;
}

.prompt-card:first-child {
  padding-top: 18px;
}

.prompt-card:last-child {
  border-bottom: 0;
  padding-bottom: 18px;
}

.prompt-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: stretch;
  width: 84px;
  flex: 0 0 auto;
}

.prompt-actions .btn-sm {
  width: 100%;
  min-width: 0;
  padding-inline: 8px;
  white-space: nowrap;
}

.prompt-card p {
  margin-top: 6px;
  color: var(--fg-2);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.prompt-zh {
  margin-top: 5px;
  color: var(--muted);
  line-height: 1.45;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.prompt-meta-line {
  gap: 8px;
  min-width: 0;
}

.prompt-card-main {
  min-width: 0;
}

.prompt-meta-line strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prompt-author {
  margin-top: 4px;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
}

.model-fetch-search {
  width: 100%;
}

.model-fetch-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  color: var(--muted);
  background: var(--tint);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-sm);
  font-size: 12px;
}

.model-fetch-status span {
  min-width: 0;
}

.model-fetch-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.model-fetch-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 12px 14px;
  color: var(--fg);
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.model-fetch-item:hover,
.model-fetch-item.selected {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.mf-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--success);
}

.mf-info {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.mf-name,
.mf-id {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mf-id {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
}

.mf-kind {
  width: max-content;
  padding: 2px 8px;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--border-soft);
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
}

.mf-kind-text {
  color: #5b8fb9;
  background: rgba(87, 166, 255, 0.12);
  border-color: rgba(87, 166, 255, 0.32);
}

.mf-kind-tts {
  color: #b48fb9;
  background: rgba(199, 140, 230, 0.14);
  border-color: rgba(199, 140, 230, 0.34);
}

.mf-kind-unknown {
  color: var(--muted);
  background: rgba(0, 0, 0, 0.04);
  border-color: var(--border);
}

.mf-hint {
  color: var(--muted);
  font-size: 10px;
  line-height: 1.4;
  margin-top: 2px;
}

.model-fetch-incompatible {
  opacity: 0.55;
  background: rgba(0, 0, 0, 0.02);
}

.model-fetch-incompatible.selected {
  opacity: 1;
}

.model-catalog-blocked {
  margin: 0;
  padding: 10px 12px;
  color: var(--warn, #f0b400);
  background: rgba(240, 180, 0, 0.08);
  border: 1px solid rgba(240, 180, 0, 0.3);
  border-radius: var(--radius-md);
  font-size: 12px;
  line-height: 1.5;
}

.cover-settings-list {
  display: grid;
  gap: 10px;
}

.cover-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  background: var(--tint);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.cover-row p {
  margin-top: 4px;
  font-family: var(--font-mono);
  font-size: 11px;
}

.builtin-note {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
}

.add-row-btn {
  justify-self: stretch;
}

@media (max-width: 920px) {
  .model-console-header,
  .model-management-toolbar {
    grid-template-columns: 1fr;
  }

  .model-console-summary,
  .model-console-actions {
    justify-content: flex-start;
  }

  .model-management-row {
    grid-template-columns: 36px minmax(0, 1fr);
  }

  .model-route-summary {
    grid-column: 2 / -1;
    justify-items: start;
    text-align: left;
  }

  .prompt-filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .model-kind-tabs {
    grid-auto-flow: row;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .sync-grid {
    grid-template-columns: 1fr;
  }

  .prompt-filters {
    grid-template-columns: 1fr;
  }

  .prompt-summary,
  .model-fields,
  .model-card-head,
  .prompt-card {
    grid-template-columns: 1fr;
  }

  .cover-row {
    grid-template-columns: 1fr;
    align-items: start;
  }

  .model-fetch-grid {
    grid-template-columns: 1fr;
  }

  .prompt-actions {
    width: 100%;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
  }

  .prompt-actions .btn-sm {
    width: auto;
    min-width: 68px;
  }

  .settings-tabs {
    overflow-x: auto;
    padding-bottom: 2px;
  }

  .settings-tab {
    white-space: nowrap;
  }
}

@media (max-width: 480px) {
}
</style>
