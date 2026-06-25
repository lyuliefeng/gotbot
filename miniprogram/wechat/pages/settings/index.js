const { callFunction } = require('../../utils/cloud')
const { loadState, saveState } = require('../../utils/state')
const { expandModelProfiles } = require('../../utils/models')

const protocolOptions = ['openai-images', 'openai-image-edits', 'dashscope-wanxiang', 'multimodal-chat', 'mgtv-storyboard', 'agnes-image']
const keyModeOptions = ['user', 'platform']

function emptyDraft() {
  return {
    id: '',
    name: '我的 Agnes 图像模型',
    provider: 'openai-compatible',
    endpoint: 'https://apihub.agnes-ai.com/v1',
    apiPath: 'images/generations',
    apiProtocol: 'agnes-image',
    apiKey: '',
    apiSecret: '',
    model: 'agnes-image-2.1-flash',
    kind: 'image',
    keyMode: 'platform',
    isPrimary: false,
    status: 'untested',
  }
}

function decorateDraftMetrics(draft) {
  return {
    ...draft,
    latencyClass: draft.latencyLevel ? `latency-${draft.latencyLevel}` : '',
  }
}

function decorateModel(model) {
  const availableCount = Array.isArray(model.availableModels) ? model.availableModels.length : 0
  const selectedCount = Array.isArray(model.selectedModels) ? model.selectedModels.length : 0
  const latencyText = Number.isFinite(model.latencyMs) ? ` · ${model.latencyMs}ms` : ''
  return {
    ...model,
    keyModeLabel: model.keyMode === 'platform' ? '平台 Key' : '用户 Key',
    summary: `${model.apiProtocol} · ${model.keyMode === 'platform' ? '平台 Key' : '用户 Key'}${availableCount ? ` · 已识别 ${selectedCount || availableCount}/${availableCount}` : ''}${latencyText}`,
    latencyBadgeClass: model.latencyLevel ? `latency-${model.latencyLevel}` : '',
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
    protocolOptions,
    keyModeOptions,
    protocolIndex: 0,
    keyModeIndex: 0,
    showUserKeyFields: true,
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

  onProtocolChange(event) {
    const index = Number(event.detail.value)
    this.setData({ protocolIndex: index, 'draft.apiProtocol': protocolOptions[index] })
  },

  onKeyModeChange(event) {
    const index = Number(event.detail.value)
    const keyMode = keyModeOptions[index]
    this.setData({ keyModeIndex: index, 'draft.keyMode': keyMode, showUserKeyFields: keyMode === 'user' })
  },

  edit(event) {
    const model = this.data.models.find((item) => item.id === event.currentTarget.dataset.id)
    if (!model) return
    this.setData({
      draft: decorateDraftMetrics({ ...model, apiKey: '', apiSecret: '' }),
      protocolIndex: Math.max(0, protocolOptions.indexOf(model.apiProtocol)),
      keyModeIndex: Math.max(0, keyModeOptions.indexOf(model.keyMode)),
      showUserKeyFields: model.keyMode === 'user',
      discoveredModels: decorateDraft(model),
    })
  },

  async save() {
    try {
      const saved = await callFunction('modelProfiles', { action: 'save', profile: this.data.draft })
      const state = loadState()
      const models = state.models || []
      const index = models.findIndex((model) => model.id === saved.id)
      if (index >= 0) models[index] = saved
      else models.push(saved)
      state.models = models
      const expanded = expandModelProfiles(models)
      state.defaultModelId = state.defaultModelId || expanded[0]?.id || saved.id
      saveState(state)
      this.setData({ models: models.map(decorateModel), draft: decorateDraftMetrics(emptyDraft()), discoveredModels: [], showUserKeyFields: true, notice: '模型配置已保存', error: '' })
    } catch (error) {
      this.setData({ error: error.message || '保存失败' })
    }
  },

  async testModel() {
    try {
      const result = await callFunction('modelProfiles', { action: 'test', profile: this.data.draft })
      const nextDraft = decorateDraftMetrics({ ...this.data.draft, latencyMs: result.latencyMs, latencyLevel: result.latencyLevel, lastCheckedAt: new Date().toISOString(), status: result.ok ? 'connected' : 'failed' })
      this.setData({ draft: nextDraft, notice: result.message, error: '' })
    } catch (error) {
      this.setData({ error: error.message || '检测失败' })
    }
  },

  async discoverModels() {
    try {
      this.setData({ notice: '正在识别模型...', error: '' })
      const saved = await callFunction('modelProfiles', { action: 'discover', profile: this.data.draft })
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
        notice: `已识别 ${saved.availableModels?.length || 0} 个模型`,
        error: '',
      })
    } catch (error) {
      this.setData({ error: error.message || '识别模型失败', notice: '' })
    }
  },

  toggleDiscoveredModel(event) {
    const modelId = event.currentTarget.dataset.id
    const draft = this.data.draft
    const selected = new Set(draft.selectedModels || [])
    if (selected.has(modelId)) selected.delete(modelId)
    else selected.add(modelId)
    const nextDraft = decorateDraftMetrics({ ...draft, selectedModels: Array.from(selected) })
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
