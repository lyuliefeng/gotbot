const { callFunction } = require('../../utils/cloud')
const { loadState, saveState } = require('../../utils/state')

const apiProtocol = 'openai-images'
const apiPath = 'v1/images/generations'
const nameOptions = [
  { label: '默认 Agnes', value: '默认 Agnes 图片模型', endpoint: 'https://apihub.agnes-ai.com', model: 'agnes-image-2.1-flash', kind: 'image', keyMode: 'platform' },
  { label: '兼容接口', value: 'OpenAI 兼容模型', endpoint: '', model: '', kind: 'image' },
  { label: '自定义', value: '', kind: 'image' },
]
const kindOptions = [
  { label: '图片模型', value: 'image', hint: '文生图、图生图、封面、ICON、3D 图和 GIF 会自动使用这个通道。' },
  { label: '视频模型', value: 'video', hint: '视频创作会自动只显示这个通道的模型。' },
]
const keyModeOptions = [
  { label: '平台统一 Key', value: 'platform', hint: '使用云函数里配置好的平台 Key，小程序里不用填写密钥。' },
  { label: '我的 Key', value: 'user', hint: '使用你自己的 API Key，保存时由云函数加密存储。' },
]

function emptyDraft() {
  return {
    id: '',
    name: '默认 Agnes 图片模型',
    provider: 'openai-compatible',
    endpoint: 'https://apihub.agnes-ai.com',
    apiPath,
    apiProtocol,
    apiKey: '',
    model: 'agnes-image-2.1-flash',
    kind: 'image',
    keyMode: 'platform',
    isPrimary: false,
    status: 'untested',
  }
}

function decorateModel(model) {
  const kindLabel = model.kind === 'video' ? '视频' : '图片'
  const isPlatform = model.keyMode === 'platform'
  return {
    ...model,
    kindLabel,
    keyModeLabel: isPlatform ? '平台 Key 已隐藏' : '用户 Key',
    summary: `${kindLabel}通道 · ${isPlatform ? '平台 Key 已隐藏' : '我的 Key'} · ${model.model || '未选择模型'}`,
  }
}

function currentKeyModeOption(keyMode) {
  return keyModeOptions.find((item) => item.value === keyMode) || keyModeOptions[0]
}

function currentKindOption(kind) {
  return kindOptions.find((item) => item.value === kind) || kindOptions[0]
}

function modelPickerLabel(options, index) {
  if (index >= 0 && options[index]) return `选择模型：${options[index].name}`
  return '选择模型：请选择'
}

function normalizeEndpoint(endpoint) {
  return String(endpoint || '').replace(/\/+$/, '')
}

function modelsUrl(endpoint) {
  const base = normalizeEndpoint(endpoint)
  return /\/v1$/i.test(base) ? `${base}/models` : `${base}/v1/models`
}

function normalizeModels(payload) {
  const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : Array.isArray(payload) ? payload : []
  return items.map((item) => {
    const id = String(item.id || item.name || item.model || '').replace(/^models\//, '')
    return { id, name: item.name || id }
  }).filter((item) => item.id)
}

Page({
  data: {
    models: [],
    draft: emptyDraft(),
    nameOptions: nameOptions.map((item) => item.label),
    kindLabels: kindOptions.map((item) => item.label),
    keyModeLabels: keyModeOptions.map((item) => item.label),
    modelOptions: [],
    currentNameLabel: nameOptions[0].label,
    currentKindLabel: kindOptions[0].label,
    currentKeyModeLabel: keyModeOptions[0].label,
    currentModelLabel: '选择模型：请选择',
    currentModelText: 'agnes-image-2.1-flash',
    platformStatusText: '默认主模型 API：https://apihub.agnes-ai.com',
    nameIndex: 0,
    kindIndex: 0,
    keyModeIndex: 0,
    showCustomName: false,
    showUserKeyFields: false,
    kindHint: kindOptions[0].hint,
    keyModeHint: keyModeOptions[0].hint,
    modelIndex: -1,
    isFetchingModels: false,
    showManualModelInput: false,
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
        next.defaultModelId = models.find((model) => model.isPrimary)?.id || models[0].id
        saveState(next)
        this.setData({ models: models.map(decorateModel) })
      }
    }).catch(() => undefined)
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field
    const next = { [`draft.${field}`]: event.detail.value }
    if (field === 'model') next.currentModelText = event.detail.value || '未选择模型'
    this.setData(next)
  },

  onNameModeChange(event) {
    const index = Number(event.detail.value)
    const preset = nameOptions[index]
    const next = {
      nameIndex: index,
      currentNameLabel: preset.label,
      showCustomName: preset.label === '自定义',
      notice: '',
      error: '',
    }
    if (preset.value) {
      next['draft.name'] = preset.value
      next['draft.endpoint'] = preset.endpoint
      next['draft.model'] = preset.model
      next['draft.kind'] = preset.kind || 'image'
      next['draft.keyMode'] = preset.keyMode || 'platform'
      next.kindIndex = Math.max(0, kindOptions.findIndex((item) => item.value === (preset.kind || 'image')))
      next.currentKindLabel = currentKindOption(preset.kind).label
      next.kindHint = currentKindOption(preset.kind).hint
      next.keyModeIndex = Math.max(0, keyModeOptions.findIndex((item) => item.value === (preset.keyMode || 'platform')))
      next.currentKeyModeLabel = currentKeyModeOption(preset.keyMode || 'platform').label
      next.showUserKeyFields = (preset.keyMode || 'platform') === 'user'
      next.keyModeHint = currentKeyModeOption(preset.keyMode || 'platform').hint
      next.modelOptions = []
      next.modelIndex = -1
      next.showManualModelInput = false
      next.currentModelText = preset.model || '先拉取或手动填写模型 ID'
    } else {
      next['draft.name'] = ''
      next['draft.kind'] = 'image'
      next.kindIndex = 0
      next.currentKindLabel = kindOptions[0].label
      next.kindHint = kindOptions[0].hint
      next.modelOptions = []
      next.modelIndex = -1
      next.showManualModelInput = true
      next.currentModelText = '先拉取或手动填写模型 ID'
    }
    this.setData(next)
  },

  onKindChange(event) {
    const index = Number(event.detail.value)
    const option = kindOptions[index] || kindOptions[0]
    this.setData({
      kindIndex: index,
      currentKindLabel: option.label,
      'draft.kind': option.value,
      kindHint: option.hint,
      notice: '',
      error: '',
    })
  },

  onKeyModeChange(event) {
    const index = Number(event.detail.value)
    const option = keyModeOptions[index]
    this.setData({
      keyModeIndex: index,
      currentKeyModeLabel: option.label,
      'draft.keyMode': option.value,
      showUserKeyFields: option.value === 'user',
      keyModeHint: option.hint,
      notice: '',
      error: '',
    })
  },

  onModelChange(event) {
    const index = Number(event.detail.value)
    const model = this.data.modelOptions[index]
    if (!model) return
    this.setData({
      modelIndex: index,
      currentModelLabel: modelPickerLabel(this.data.modelOptions, index),
      currentModelText: model.id,
      showManualModelInput: false,
      'draft.model': model.id,
      notice: `已选择 ${model.name || model.id}`,
      error: '',
    })
  },

  toggleManualModelInput() {
    this.setData({ showManualModelInput: !this.data.showManualModelInput })
  },

  fetchModels() {
    const draft = this.data.draft
    if (!draft.endpoint?.trim()) {
      this.setData({ error: '请先填写 Base URL' })
      return
    }
    this.setData({ isFetchingModels: true, notice: '', error: '' })
    callFunction('modelProfiles', { action: 'discover', profile: { ...draft, apiProtocol, apiPath } })
      .then((result) => {
        const models = normalizeModels(result.availableModels || result.models || result)
        if (!models.length) throw new Error('没有拉取到可选模型')
        this.setData({
          modelOptions: models,
          modelIndex: models.findIndex((item) => item.id === draft.model),
          currentModelLabel: modelPickerLabel(models, models.findIndex((item) => item.id === draft.model)),
          currentModelText: draft.model || '未选择模型',
          showManualModelInput: false,
          isFetchingModels: false,
          notice: `已拉取 ${models.length} 个模型，请选择模型 ID`,
          error: '',
        })
      })
      .catch((cloudError) => {
        if (draft.keyMode === 'platform') {
          this.setData({ isFetchingModels: false, error: cloudError.message || '平台 Key 模型拉取需要先更新云函数' })
          return
        }
        this.fetchModelsFromClient(draft)
      })
  },

  fetchModelsFromClient(draft) {
    if (!draft.apiKey?.trim()) {
      this.setData({ isFetchingModels: false, error: '使用我的 Key 拉取模型时，请先填写 API Key' })
      return
    }
    wx.request({
      url: modelsUrl(draft.endpoint),
      method: 'GET',
      header: { Authorization: `Bearer ${draft.apiKey}`, Accept: 'application/json' },
      success: (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          this.setData({ isFetchingModels: false, error: `模型拉取失败：${res.statusCode}` })
          return
        }
        const models = normalizeModels(res.data)
        if (!models.length) {
          this.setData({ isFetchingModels: false, error: '没有拉取到可选模型' })
          return
        }
        this.setData({
          modelOptions: models,
          modelIndex: models.findIndex((item) => item.id === draft.model),
          currentModelLabel: modelPickerLabel(models, models.findIndex((item) => item.id === draft.model)),
          currentModelText: draft.model || '未选择模型',
          showManualModelInput: false,
          isFetchingModels: false,
          notice: `已拉取 ${models.length} 个模型，请选择模型 ID`,
          error: '',
        })
      },
      fail: (error) => this.setData({ isFetchingModels: false, error: error.errMsg || '模型拉取失败' }),
    })
  },

  edit(event) {
    const model = this.data.models.find((item) => item.id === event.currentTarget.dataset.id)
    if (!model) return
    const keyMode = model.keyMode || 'platform'
    this.setData({
      draft: { ...emptyDraft(), ...model, apiProtocol, apiPath, endpoint: normalizeEndpoint(model.endpoint), apiKey: '' },
      nameIndex: 2,
      currentNameLabel: nameOptions[2].label,
      showCustomName: true,
      kindIndex: Math.max(0, kindOptions.findIndex((item) => item.value === (model.kind || 'image'))),
      currentKindLabel: currentKindOption(model.kind).label,
      kindHint: currentKindOption(model.kind).hint,
      keyModeIndex: Math.max(0, keyModeOptions.findIndex((item) => item.value === keyMode)),
      currentKeyModeLabel: currentKeyModeOption(keyMode).label,
      showUserKeyFields: keyMode === 'user',
      keyModeHint: currentKeyModeOption(keyMode).hint,
      modelOptions: [],
      modelIndex: -1,
      currentModelLabel: '选择模型：请选择',
      currentModelText: model.model || '未选择模型',
      showManualModelInput: false,
    })
  },

  async save() {
    try {
      const saved = await callFunction('modelProfiles', { action: 'save', profile: { ...this.data.draft, apiProtocol, apiPath, endpoint: normalizeEndpoint(this.data.draft.endpoint) } })
      const state = loadState()
      const models = state.models || []
      const index = models.findIndex((model) => model.id === saved.id)
      if (index >= 0) models[index] = saved
      else models.push(saved)
      state.models = models
      if ((saved.kind || 'image') === 'video') state.defaultVideoModelId = state.defaultVideoModelId || saved.id
      else state.defaultModelId = state.defaultModelId || saved.id
      saveState(state)
      this.setData({
        models: models.map(decorateModel),
        draft: emptyDraft(),
        nameIndex: 0,
        currentNameLabel: nameOptions[0].label,
        kindIndex: 0,
        currentKindLabel: kindOptions[0].label,
        kindHint: kindOptions[0].hint,
        showCustomName: false,
        keyModeIndex: 0,
        currentKeyModeLabel: keyModeOptions[0].label,
        showUserKeyFields: false,
        keyModeHint: keyModeOptions[0].hint,
        modelOptions: [],
        modelIndex: -1,
        currentModelLabel: '选择模型：请选择',
        currentModelText: 'agnes-image-2.1-flash',
        showManualModelInput: false,
        notice: '模型配置已保存',
        error: '',
      })
    } catch (error) {
      this.setData({ error: error.message || '保存失败' })
    }
  },

  async testModel() {
    try {
      const draft = this.data.draft
      const profileId = draft.id
      const result = profileId
        ? await callFunction('modelProfiles', { action: 'test', profileId })
        : await callFunction('modelProfiles', { action: 'test', profile: { ...draft, apiProtocol, apiPath, endpoint: normalizeEndpoint(draft.endpoint) } })
      this.setData({ notice: result.message, error: '' })
    } catch (error) {
      this.setData({ error: error.message || '检测失败' })
    }
  },

  async remove(event) {
    const id = event.currentTarget.dataset.id
    await callFunction('modelProfiles', { action: 'delete', id }).catch(() => true)
    const state = loadState()
    state.models = (state.models || []).filter((model) => model.id !== id)
    if (state.defaultModelId === id) state.defaultModelId = (state.models.find((m) => (m.kind || 'image') !== 'video') || {}).id || ''
    if (state.defaultVideoModelId === id) state.defaultVideoModelId = (state.models.find((m) => m.kind === 'video') || {}).id || ''
    saveState(state)
    this.setData({ models: state.models.map(decorateModel) })
  },
})
