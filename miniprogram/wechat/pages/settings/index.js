const { callFunction } = require('../../utils/cloud')
const { loadState, saveState } = require('../../utils/state')
const { expandModelProfiles } = require('../../utils/models')

const apiTypeOptions = ['custom', 'openai', 'claude', 'gemini', 'azure', 'responses']
const apiTypeLabels = ['Custom (OpenAI-compatible)', 'OpenAI', 'Anthropic', 'Google Gemini', 'Azure OpenAI', 'OpenAI Responses']
const keyModeOptions = ['user', 'platform']

function defaultUrlForApiType(apiType) {
  if (apiType === 'openai' || apiType === 'responses') return 'https://api.openai.com'
  if (apiType === 'claude') return 'https://api.anthropic.com'
  if (apiType === 'gemini') return 'https://generativelanguage.googleapis.com'
  return ''
}

function protocolForApiType(apiType) {
  if (apiType === 'responses') return 'multimodal-chat'
  return 'agnes-image'
}

function apiPathForApiType(apiType) {
  if (apiType === 'responses') return 'responses'
  return 'images/generations'
}

function emptyDraft() {
  return {
    id: '',
    name: 'Agnes 图像渠道',
    provider: 'openai-compatible',
    api_type: 'custom',
    apiType: 'custom',
    base_url: 'https://apihub.agnes-ai.com/v1',
    baseUrl: 'https://apihub.agnes-ai.com/v1',
    endpoint: 'https://apihub.agnes-ai.com/v1',
    apiPath: apiPathForApiType('custom'),
    apiProtocol: 'agnes-image',
    apiKey: '',
    apiSecret: '',
    model: 'agnes-image-2.1-flash',
    kind: 'image',
    keyMode: 'platform',
    isPrimary: false,
    enabled: true,
    notes: '',
    upstream_headers: '',
    status: 'untested',
  }
}

function normalizeDraft(draft) {
  const apiType = draft.api_type || draft.apiType || 'custom'
  const baseUrl = draft.base_url || draft.baseUrl || draft.endpoint || ''
  return {
    ...draft,
    api_type: apiType,
    apiType,
    base_url: baseUrl,
    baseUrl,
    endpoint: baseUrl,
    apiProtocol: draft.apiProtocol || protocolForApiType(apiType),
    apiPath: draft.apiPath || apiPathForApiType(apiType),
    enabled: draft.enabled !== false,
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

function decorateModel(model) {
  const channel = normalizeDraft(model)
  const availableCount = Array.isArray(channel.availableModels) ? channel.availableModels.length : 0
  const selectedCount = Array.isArray(channel.selectedModels) ? channel.selectedModels.length : 0
  const latencyText = Number.isFinite(model.latencyMs) ? ` · ${model.latencyMs}ms` : ''
  return {
    ...channel,
    keyModeLabel: channel.keyMode === 'platform' ? '平台 Key' : '用户 Key',
    apiTypeLabel: apiTypeLabels[Math.max(0, apiTypeOptions.indexOf(channel.api_type))],
    enabledText: channel.enabled ? '已启用' : '已停用',
    enabledClass: channel.enabled ? 'enabled' : 'disabled',
    summary: `${channel.api_type} · ${channel.keyMode === 'platform' ? '平台 Key' : '用户 Key'}${availableCount ? ` · API ${selectedCount || availableCount}/${availableCount}` : ''}${latencyText}`,
    latencyBadgeClass: channel.latencyLevel ? `latency-${channel.latencyLevel}` : '',
    latencyLabel: Number.isFinite(model.latencyMs) ? `${model.latencyMs}ms` : '未测速',
  }
}

function decorateDraft(draft) {
  const selected = new Set(draft.selectedModels || [])
  return (draft.availableModels || []).map((model) => ({
    ...model,
    checked: selected.has(model.id) || selected.has(model.name),
    checkedText: selected.has(model.id) || selected.has(model.name) ? '已启用' : '未启用',
  }))
}

Page({
  data: {
    models: [],
    draft: decorateDraftMetrics(emptyDraft()),
    apiTypeOptions,
    apiTypeLabels,
    keyModeOptions,
    apiTypeIndex: 0,
    keyModeIndex: 0,
    showUserKeyFields: false,
    discoveredModels: [],
    notice: '',
    error: '',
  },

  onShow() {
    const state = loadState()
    this.setData({ models: (state.models || []).map(decorateModel) })
    callFunction('modelProfiles', { action: 'list' }).then((models) => {
      if (models && models.length) {
        const next = loadState()
        next.models = models
        const expanded = expandModelProfiles(models)
        next.defaultModelId = expanded.find((model) => model.isPrimary)?.id || expanded[0]?.id || models[0].id
        saveState(next)
        this.setData({ models: models.map(decorateModel) })
      }
    }).catch(() => undefined)
  },

  onInput(event) {
    this.setData({ [`draft.${event.currentTarget.dataset.field}`]: event.detail.value })
  },

  onBaseUrlInput(event) {
    this.setData({ 'draft.base_url': event.detail.value, 'draft.baseUrl': event.detail.value, 'draft.endpoint': event.detail.value })
  },

  onApiTypeChange(event) {
    const index = Number(event.detail.value)
    const apiType = apiTypeOptions[index]
    const currentBaseUrl = this.data.draft.base_url || this.data.draft.endpoint || ''
    const nextBaseUrl = currentBaseUrl || defaultUrlForApiType(apiType)
    this.setData({
      apiTypeIndex: index,
      'draft.api_type': apiType,
      'draft.apiType': apiType,
      'draft.base_url': nextBaseUrl,
      'draft.baseUrl': nextBaseUrl,
      'draft.endpoint': nextBaseUrl,
      'draft.apiProtocol': protocolForApiType(apiType),
      'draft.apiPath': apiPathForApiType(apiType),
    })
  },

  onKeyModeChange(event) {
    const index = Number(event.detail.value)
    const keyMode = keyModeOptions[index]
    this.setData({ keyModeIndex: index, 'draft.keyMode': keyMode, showUserKeyFields: keyMode === 'user' })
  },

  onEnabledChange(event) {
    const enabled = Boolean(event.detail.value)
    this.setData({ 'draft.enabled': enabled, 'draft.enabledText': enabled ? '已启用' : '已停用' })
  },

  edit(event) {
    const model = this.data.models.find((item) => item.id === event.currentTarget.dataset.id)
    if (!model) return
    const draft = decorateDraftMetrics({ ...model, apiKey: '', apiSecret: '' })
    this.setData({
      draft,
      apiTypeIndex: Math.max(0, apiTypeOptions.indexOf(draft.api_type)),
      keyModeIndex: Math.max(0, keyModeOptions.indexOf(draft.keyMode)),
      showUserKeyFields: draft.keyMode === 'user',
      discoveredModels: decorateDraft(draft),
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
      this.setData({ models: models.map(decorateModel), draft: decorateDraftMetrics(emptyDraft()), discoveredModels: [], showUserKeyFields: false, apiTypeIndex: 0, keyModeIndex: 0, notice: '渠道已保存并同步 API 池', error: '' })
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
      this.setData({ notice: '正在拉取渠道模型...', error: '' })
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
        models: models.map(decorateModel),
        draft: decorateDraftMetrics(saved),
        discoveredModels: decorateDraft(saved),
        showUserKeyFields: saved.keyMode === 'user',
        notice: `已拉取 ${saved.availableModels?.length || 0} 个模型并同步 API 池`,
        error: '',
      })
    } catch (error) {
      this.setData({ error: error.message || '拉取模型失败', notice: '' })
    }
  },

  toggleDiscoveredModel(event) {
    const modelId = event.currentTarget.dataset.id
    const draft = this.data.draft
    const selected = new Set(draft.selectedModels || [])
    if (selected.has(modelId)) selected.delete(modelId)
    else selected.add(modelId)
    const selectedModels = Array.from(selected)
    const nextDraft = decorateDraftMetrics({ ...draft, selectedModels, selected_models: selectedModels })
    this.setData({ draft: nextDraft, discoveredModels: decorateDraft(nextDraft) })
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
    this.setData({ models: state.models.map(decorateModel) })
  },
})
