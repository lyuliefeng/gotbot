const { callFunction } = require('../../utils/cloud')
const { loadState, saveState } = require('../../utils/state')
const { expandModelProfiles } = require('../../utils/models')

const apiKindOptions = ['text', 'image', 'video']
const apiKindLabels = ['agnes（语言模型）', 'image（生图模型）', 'video（视频模型）']

function protocolForKind(kind) {
  if (kind === 'text') return 'multimodal-chat'
  if (kind === 'video') return 'agnes-video'
  return 'agnes-image'
}

function apiPathForKind(kind) {
  if (kind === 'text') return 'chat/completions'
  if (kind === 'video') return 'videos/generations'
  return 'images/generations'
}

function defaultModelForKind(kind) {
  if (kind === 'text') return 'gpt-4o-mini'
  if (kind === 'video') return 'agnes-video'
  return 'agnes-image-2.1-flash'
}

function labelForKind(kind) {
  return apiKindLabels[Math.max(0, apiKindOptions.indexOf(kind))]
}

function apiTypeForKind(kind) {
  return kind === 'text' ? 'openai' : 'custom'
}

function baseUrlOf(channel) {
  return channel.base_url || channel.baseUrl || channel.endpoint || ''
}

function availableModelsOf(channel) {
  return Array.isArray(channel.availableModels)
    ? channel.availableModels
    : Array.isArray(channel.available_models)
      ? channel.available_models
      : []
}

function selectedModelsOf(channel) {
  return Array.isArray(channel.selectedModels) && channel.selectedModels.length
    ? channel.selectedModels
    : Array.isArray(channel.selected_models) && channel.selected_models.length
      ? channel.selected_models
      : []
}

function emptyDraft() {
  return {
    id: '',
    name: '',
    provider: 'openai-compatible',
    api_type: 'custom',
    apiType: 'custom',
    base_url: '',
    baseUrl: '',
    endpoint: '',
    apiPath: apiPathForKind('image'),
    apiProtocol: protocolForKind('image'),
    apiKey: '',
    apiSecret: '',
    model: defaultModelForKind('image'),
    kind: 'image',
    keyMode: 'user',
    isPrimary: false,
    enabled: true,
    notes: '',
    upstream_headers: '',
    status: 'untested',
  }
}

function normalizeDraft(draft) {
  const kind = draft.kind || 'image'
  const apiType = draft.api_type || draft.apiType || apiTypeForKind(kind)
  const baseUrl = baseUrlOf(draft)
  const availableModels = availableModelsOf(draft)
  const selectedModels = selectedModelsOf(draft)
  return {
    ...draft,
    kind,
    api_type: apiType,
    apiType,
    base_url: baseUrl,
    baseUrl,
    endpoint: baseUrl,
    apiProtocol: draft.apiProtocol || protocolForKind(kind),
    apiPath: draft.apiPath || apiPathForKind(kind),
    keyMode: draft.keyMode || 'user',
    model: draft.model || selectedModels[0] || availableModels[0]?.id || availableModels[0]?.name || defaultModelForKind(kind),
    enabled: draft.enabled !== false,
    availableModels,
    available_models: availableModels,
    selectedModels,
    selected_models: selectedModels,
    response_ms: draft.response_ms || (Number.isFinite(draft.latencyMs) ? String(draft.latencyMs) : ''),
  }
}

function decorateDraftMetrics(draft) {
  const next = normalizeDraft(draft)
  return {
    ...next,
    enabledText: next.enabled ? '已启用' : '已停用',
    latencyClass: next.latencyLevel ? `latency-${next.latencyLevel}` : '',
  }
}

function decorateChannel(channel) {
  const normalized = normalizeDraft(channel)
  const availableCount = normalized.availableModels.length
  const selectedCount = normalized.selectedModels.length
  const latencyText = Number.isFinite(normalized.latencyMs) ? ` · ${normalized.latencyMs}ms` : ''
  return {
    ...normalized,
    displayName: normalized.name || '未命名渠道',
    kindLabel: labelForKind(normalized.kind),
    enabledText: normalized.enabled ? '已启用' : '已停用',
    enabledClass: normalized.enabled ? 'enabled' : 'disabled',
    summary: `${labelForKind(normalized.kind)}${availableCount ? ` · 模型 ${selectedCount || availableCount}/${availableCount}` : ''}${latencyText}`,
    latencyBadgeClass: normalized.latencyLevel ? `latency-${normalized.latencyLevel}` : '',
    latencyLabel: Number.isFinite(normalized.latencyMs) ? `${normalized.latencyMs}ms` : '未测速',
  }
}

function pageModels(models) {
  return {
    models: (models || []).map(decorateChannel),
    hasNoChannels: !(models || []).length,
  }
}

function decorateDiscoveredModels(draft) {
  const selected = new Set(selectedModelsOf(draft))
  return availableModelsOf(draft).map((model) => ({
    ...model,
    checked: selected.has(model.id) || selected.has(model.name),
    checkedText: selected.has(model.id) || selected.has(model.name) ? '已启用' : '未启用',
  }))
}

Page({
  data: {
    models: [],
    hasNoChannels: true,
    draft: decorateDraftMetrics(emptyDraft()),
    showEditor: false,
    editorTitle: '添加渠道',
    apiKindOptions,
    apiKindLabels,
    apiKindIndex: 1,
    currentApiKindLabel: apiKindLabels[1],
    discoveredModels: [],
    notice: '',
    error: '',
  },

  onShow() {
    const state = loadState()
    this.setData(pageModels(state.models || []))
    callFunction('modelProfiles', { action: 'list' }).then((models) => {
      if (models && models.length) {
        const next = loadState()
        next.models = models
        const expanded = expandModelProfiles(models)
        next.defaultModelId = expanded.find((model) => model.isPrimary)?.id || expanded[0]?.id || models[0].id
        saveState(next)
        this.setData(pageModels(models))
      }
    }).catch(() => undefined)
  },

  onInput(event) {
    this.setData({ [`draft.${event.currentTarget.dataset.field}`]: event.detail.value })
  },

  onBaseUrlInput(event) {
    this.setData({ 'draft.base_url': event.detail.value, 'draft.baseUrl': event.detail.value, 'draft.endpoint': event.detail.value })
  },

  openAddChannel() {
    this.setData({
      showEditor: true,
      editorTitle: '添加渠道',
      draft: decorateDraftMetrics(emptyDraft()),
      apiKindIndex: 1,
      currentApiKindLabel: apiKindLabels[1],
      discoveredModels: [],
      notice: '',
      error: '',
    })
  },

  cancelEdit() {
    this.setData({ showEditor: false, draft: decorateDraftMetrics(emptyDraft()), discoveredModels: [], notice: '', error: '' })
  },

  onApiKindChange(event) {
    const index = Number(event.detail.value)
    const kind = apiKindOptions[index]
    const apiType = apiTypeForKind(kind)
    this.setData({
      apiKindIndex: index,
      currentApiKindLabel: apiKindLabels[index],
      'draft.kind': kind,
      'draft.api_type': apiType,
      'draft.apiType': apiType,
      'draft.apiProtocol': protocolForKind(kind),
      'draft.apiPath': apiPathForKind(kind),
      'draft.model': defaultModelForKind(kind),
    })
  },

  onEnabledChange(event) {
    const enabled = Boolean(event.detail.value)
    this.setData({ 'draft.enabled': enabled, 'draft.enabledText': enabled ? '已启用' : '已停用' })
  },

  edit(event) {
    const channel = this.data.models.find((item) => item.id === event.currentTarget.dataset.id)
    if (!channel) return
    const draft = decorateDraftMetrics({ ...channel, apiKey: '', apiSecret: '' })
    this.setData({
      showEditor: true,
      editorTitle: '编辑渠道',
      draft,
      apiKindIndex: Math.max(0, apiKindOptions.indexOf(draft.kind)),
      currentApiKindLabel: apiKindLabels[Math.max(0, apiKindOptions.indexOf(draft.kind))],
      discoveredModels: decorateDiscoveredModels(draft),
      notice: '',
      error: '',
    })
  },

  async save() {
    try {
      const saved = await callFunction('modelProfiles', { action: 'save', profile: normalizeDraft(this.data.draft) })
      const state = loadState()
      const models = state.models || []
      const index = models.findIndex((model) => model.id === saved.id)
      if (index >= 0) models[index] = saved
      else models.push(saved)
      state.models = models
      const expanded = expandModelProfiles(models)
      state.defaultModelId = state.defaultModelId || expanded[0]?.id || saved.id
      saveState(state)
      this.setData({ ...pageModels(models), draft: decorateDraftMetrics(emptyDraft()), discoveredModels: [], showEditor: false, notice: '渠道已保存并同步 API 池', error: '' })
    } catch (error) {
      this.setData({ error: error.message || '保存失败' })
    }
  },

  async testModel() {
    try {
      const result = await callFunction('modelProfiles', { action: 'test', profile: normalizeDraft(this.data.draft) })
      const nextDraft = decorateDraftMetrics({ ...this.data.draft, latencyMs: result.latencyMs, latencyLevel: result.latencyLevel, response_ms: String(result.latencyMs || ''), lastCheckedAt: new Date().toISOString(), status: result.ok ? 'connected' : 'failed' })
      this.setData({ draft: nextDraft, notice: result.message, error: '' })
    } catch (error) {
      this.setData({ error: error.message || '检测失败' })
    }
  },

  async discoverModels() {
    try {
      this.setData({ notice: '正在获取模型列表...', error: '' })
      const saved = await callFunction('modelProfiles', { action: 'discover', profile: normalizeDraft(this.data.draft) })
      const state = loadState()
      const models = state.models || []
      const index = models.findIndex((model) => model.id === saved.id)
      if (index >= 0) models[index] = saved
      else models.push(saved)
      const expanded = expandModelProfiles(models)
      state.models = models
      state.defaultModelId = expanded[0]?.id || saved.id
      saveState(state)
      this.setData({
        ...pageModels(models),
        draft: decorateDraftMetrics(saved),
        discoveredModels: decorateDiscoveredModels(saved),
        showEditor: true,
        notice: `已获取 ${availableModelsOf(saved).length} 个模型并同步 API 池`,
        error: '',
      })
    } catch (error) {
      this.setData({ error: error.message || '获取模型列表失败', notice: '' })
    }
  },

  toggleDiscoveredModel(event) {
    const modelId = event.currentTarget.dataset.id
    const draft = this.data.draft
    const selected = new Set(selectedModelsOf(draft))
    if (selected.has(modelId)) selected.delete(modelId)
    else selected.add(modelId)
    const selectedModels = Array.from(selected)
    const nextDraft = decorateDraftMetrics({ ...draft, selectedModels, selected_models: selectedModels })
    this.setData({ draft: nextDraft, discoveredModels: decorateDiscoveredModels(nextDraft) })
  },

  setDefaultDiscoveredModel(event) {
    const modelId = event.currentTarget.dataset.id
    const profileId = this.data.draft.id
    const state = loadState()
    state.defaultModelId = `${profileId}-${modelId}`
    saveState(state)
    this.setData({ notice: '默认模型已更新', error: '' })
  },

  async remove(event) {
    const id = event.currentTarget.dataset.id
    await callFunction('modelProfiles', { action: 'delete', id }).catch(() => true)
    const state = loadState()
    state.models = (state.models || []).filter((model) => model.id !== id)
    saveState(state)
    this.setData(pageModels(state.models))
  },
})
