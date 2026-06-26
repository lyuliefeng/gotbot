const { callFunction } = require('../../utils/cloud')
const { loadState, saveState } = require('../../utils/state')

const apiProtocol = 'openai-images'
const apiPath = 'v1/images/generations'
const nameOptions = [
  { label: '文字/多模态', value: '第三方文字模型', endpoint: '', model: '', kind: 'text' },
  { label: '生图接口', value: '第三方生图模型', endpoint: '', model: '', kind: 'image' },
  { label: '生视频接口', value: '第三方生视频模型', endpoint: '', model: '', kind: 'video' },
  { label: '自定义', value: '', kind: 'image' },
]
const customNameIndex = nameOptions.length - 1
const kindOptions = [
  { label: '文字/多模态识别', value: 'text', hint: '用于文字对话、多模态识别、提示词处理等能力。' },
  { label: '生图模型', value: 'image', hint: '文生图、图生图、封面、ICON、3D 图和 GIF 会自动使用这个通道。' },
  { label: '生视频模型', value: 'video', hint: '文生视频和图生视频会自动只显示这个通道的模型。' },
]
function emptyDraft() {
  return {
    id: '',
    name: '第三方文字模型',
    provider: 'openai-compatible',
    endpoint: '',
    apiPath,
    apiProtocol,
    apiKey: '',
    model: '',
    kind: 'text',
    keyMode: 'user',
    isPrimary: false,
    status: 'untested',
  }
}

function isThirdPartyModel(model) {
  return (model.keyMode || 'platform') === 'user'
}

function decorateModel(model) {
  const kindLabel = currentKindOption(model.kind).shortLabel
  const latencyText = typeof model.latencyMs === 'number' ? ` · ${model.latencyMs}ms` : ''
  return {
    ...model,
    kindLabel,
    keyModeLabel: '第三方 Key',
    summary: `${kindLabel} · 第三方接口${latencyText} · ${model.model || '未选择模型'}`,
  }
}

function currentKindOption(kind) {
  const option = kindOptions.find((item) => item.value === kind) || kindOptions[0]
  return { ...option, shortLabel: option.value === 'text' ? '文字/多模态' : option.value === 'video' ? '生视频' : '生图' }
}

function modelPickerLabel(options, index) {
  if (index >= 0 && options[index]) {
    const latency = typeof options[index].latencyMs === 'number' ? ` · ${options[index].latencyMs}ms` : ''
    return `选择模型：${options[index].name}${latency}`
  }
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
  const latencyMs = typeof payload?.latencyMs === 'number' ? payload.latencyMs : undefined
  const items = Array.isArray(payload?.models) ? payload.models : Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : []
  return items.map((item) => {
    const id = String(item.id || item.name || item.model || '').replace(/^models\//, '')
    return { id, name: item.name || id, kind: item.kind || classifyModel(id), latencyMs: typeof item.latencyMs === 'number' ? item.latencyMs : latencyMs }
  }).filter((item) => item.id)
}

function classifyModel(value) {
  const raw = String(value || '').toLowerCase()
  if (/video|wan|kling|hailuo|runway|pika|luma|sora|veo|seedance/.test(raw)) return 'video'
  if (/image|img|flux|dall|gpt-image|midjourney|stable|sdxl|sd-|dream|recraft|ideogram|kolors|agnes-image/.test(raw)) return 'image'
  return 'text'
}

function bestModelForKind(models, kind) {
  const scoped = models.filter((model) => (model.kind || 'text') === kind)
  return scoped.slice().sort((a, b) => (a.latencyMs || Number.MAX_SAFE_INTEGER) - (b.latencyMs || Number.MAX_SAFE_INTEGER))[0] || scoped[0] || models[0]
}

function applyModelDiscovery(models, kind) {
  const selected = bestModelForKind(models, kind)
  const selectedIndex = selected ? models.findIndex((item) => item.id === selected.id) : -1
  return {
    modelOptions: models,
    modelIndex: selectedIndex,
    currentModelLabel: modelPickerLabel(models, selectedIndex),
    currentModelText: selected ? selected.id : '未选择模型',
    'draft.model': selected ? selected.id : '',
    'draft.kind': selected ? selected.kind : kind,
    kindIndex: Math.max(0, kindOptions.findIndex((item) => item.value === (selected ? selected.kind : kind))),
    currentKindLabel: currentKindOption(selected ? selected.kind : kind).label,
    kindHint: currentKindOption(selected ? selected.kind : kind).hint,
    showManualModelInput: false,
  }
}

function modelCounts(models) {
  return models.reduce((counts, model) => {
    const kind = model.kind || 'text'
    counts[kind] = (counts[kind] || 0) + 1
    return counts
  }, { text: 0, image: 0, video: 0 })
}

function mergeModels(existing, incoming) {
  const map = new Map((existing || []).map((model) => [model.id, model]))
  for (const model of incoming || []) map.set(model.id, model)
  return Array.from(map.values())
}

Page({
  data: {
    models: [],
    draft: emptyDraft(),
    nameOptions: nameOptions.map((item) => item.label),
    kindLabels: kindOptions.map((item) => item.label),
    modelOptions: [],
    currentNameLabel: nameOptions[0].label,
    currentKindLabel: kindOptions[0].label,
    currentModelLabel: '选择模型：请选择',
    currentModelText: '先拉取或手动填写模型 ID',
    nameIndex: 0,
    kindIndex: 0,
    showCustomName: false,
    kindHint: kindOptions[0].hint,
    modelIndex: -1,
    isFetchingModels: false,
    showManualModelInput: true,
    notice: '',
    error: '',
  },

  onShow() {
    const state = loadState()
    this.setData({ models: (state.models || []).filter(isThirdPartyModel).map(decorateModel) })
    callFunction('modelProfiles', { action: 'list' }).then((models) => {
      if (models && models.length) {
        const next = loadState()
        const platformModels = (next.models || []).filter((model) => !isThirdPartyModel(model))
        next.models = platformModels.concat(models)
        const primaryText = models.find((model) => model.isPrimary && model.kind === 'text')
        const primaryImage = models.find((model) => model.isPrimary && (model.kind || 'image') === 'image')
        const primaryVideo = models.find((model) => model.isPrimary && model.kind === 'video')
        if (primaryText) next.defaultTextModelId = primaryText.id
        if (primaryImage) next.defaultModelId = primaryImage.id
        if (primaryVideo) next.defaultVideoModelId = primaryVideo.id
        saveState(next)
        this.setData({ models: models.filter(isThirdPartyModel).map(decorateModel) })
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
      next['draft.keyMode'] = 'user'
      next.kindIndex = Math.max(0, kindOptions.findIndex((item) => item.value === (preset.kind || 'image')))
      next.currentKindLabel = currentKindOption(preset.kind).label
      next.kindHint = currentKindOption(preset.kind).hint
      next.modelOptions = []
      next.modelIndex = -1
      next.showManualModelInput = true
      next.currentModelText = preset.model || '先拉取或手动填写模型 ID'
    } else {
      next['draft.name'] = ''
      next['draft.kind'] = 'text'
      next['draft.keyMode'] = 'user'
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
      'draft.kind': model.kind || this.data.draft.kind,
      kindIndex: Math.max(0, kindOptions.findIndex((item) => item.value === (model.kind || this.data.draft.kind))),
      currentKindLabel: currentKindOption(model.kind || this.data.draft.kind).label,
      kindHint: currentKindOption(model.kind || this.data.draft.kind).hint,
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
      this.setData({ error: '请先填写第三方接口地址' })
      return
    }
    this.setData({ isFetchingModels: true, notice: '', error: '' })
    callFunction('modelProfiles', { action: 'discover', profile: { ...draft, apiProtocol, apiPath } })
      .then((result) => {
        const models = normalizeModels(result.availableModels || result.models || result)
        if (!models.length) throw new Error('没有拉取到可选模型')
        return this.importDiscoveredModels(models, result.latencyMs)
      })
      .catch((cloudError) => {
        if (String(cloudError.message || '').includes('请填写 API Key') || String(cloudError.message || '').includes('模型拉取失败') || String(cloudError.message || '').includes('模型拉取请求超时')) {
          this.fetchModelsFromClient(draft)
          return
        }
        this.setData({ isFetchingModels: false, error: cloudError.message || '自动导入模型失败' })
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
        this.importDiscoveredModels(models, undefined).catch((error) => this.setData({ isFetchingModels: false, error: error.message || '导入模型失败' }))
      },
      fail: (error) => this.setData({ isFetchingModels: false, error: error.errMsg || '模型拉取失败' }),
    })
  },

  async importDiscoveredModels(models, latencyMs) {
    const draft = this.data.draft
    const profiles = models.map((model) => ({
      name: `${currentKindOption(model.kind).shortLabel} · ${model.name || model.id}`,
      provider: 'openai-compatible',
      endpoint: normalizeEndpoint(draft.endpoint),
      apiPath,
      apiProtocol,
      apiKey: draft.apiKey,
      model: model.id,
      kind: model.kind || 'text',
      keyMode: 'user',
      latencyMs: typeof model.latencyMs === 'number' ? model.latencyMs : latencyMs,
      status: 'untested',
    }))
    const saved = await callFunction('modelProfiles', { action: 'saveMany', profiles })
    const state = loadState()
    state.models = mergeModels(state.models || [], saved)
    const textDefault = bestModelForKind(saved, 'text')
    const imageDefault = bestModelForKind(saved, 'image')
    const videoDefault = bestModelForKind(saved, 'video')
    if (textDefault) state.defaultTextModelId = textDefault.id
    if (imageDefault) state.defaultModelId = imageDefault.id
    if (videoDefault) state.defaultVideoModelId = videoDefault.id
    saveState(state)
    const counts = modelCounts(saved)
    const next = applyModelDiscovery(models, draft.kind || 'text')
    this.setData({
      ...next,
      models: state.models.filter(isThirdPartyModel).map(decorateModel),
      showManualModelInput: false,
      isFetchingModels: false,
      notice: `已自动导入 ${saved.length} 个模型：文字/多模态 ${counts.text}，生图 ${counts.image}，生视频 ${counts.video}`,
      error: '',
    })
  },

  edit(event) {
    const model = this.data.models.find((item) => item.id === event.currentTarget.dataset.id)
    if (!model) return
    this.setData({
      draft: { ...emptyDraft(), ...model, apiProtocol, apiPath, endpoint: normalizeEndpoint(model.endpoint), apiKey: '', keyMode: 'user' },
      nameIndex: customNameIndex,
      currentNameLabel: nameOptions[customNameIndex].label,
      showCustomName: true,
      kindIndex: Math.max(0, kindOptions.findIndex((item) => item.value === (model.kind || 'image'))),
      currentKindLabel: currentKindOption(model.kind).label,
      kindHint: currentKindOption(model.kind).hint,
      modelOptions: [],
      modelIndex: -1,
      currentModelLabel: '选择模型：请选择',
      currentModelText: model.model || '未选择模型',
      showManualModelInput: false,
    })
  },

  async save() {
    try {
      const saved = await callFunction('modelProfiles', { action: 'save', profile: { ...this.data.draft, keyMode: 'user', apiProtocol, apiPath, endpoint: normalizeEndpoint(this.data.draft.endpoint) } })
      const state = loadState()
      const models = state.models || []
      const index = models.findIndex((model) => model.id === saved.id)
      if (index >= 0) models[index] = saved
      else models.push(saved)
      state.models = models
      if (saved.kind === 'text') state.defaultTextModelId = state.defaultTextModelId || saved.id
      else if (saved.kind === 'video') state.defaultVideoModelId = state.defaultVideoModelId || saved.id
      else state.defaultModelId = state.defaultModelId || saved.id
      saveState(state)
      this.setData({
        models: models.filter(isThirdPartyModel).map(decorateModel),
        draft: emptyDraft(),
        nameIndex: 0,
        currentNameLabel: nameOptions[0].label,
        kindIndex: 0,
        currentKindLabel: kindOptions[0].label,
        kindHint: kindOptions[0].hint,
        showCustomName: false,
        modelOptions: [],
        modelIndex: -1,
        currentModelLabel: '选择模型：请选择',
        currentModelText: '先拉取或手动填写模型 ID',
        showManualModelInput: true,
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
        : await callFunction('modelProfiles', { action: 'test', profile: { ...draft, keyMode: 'user', apiProtocol, apiPath, endpoint: normalizeEndpoint(draft.endpoint) } })
      this.setData({ notice: result.message, error: '' })
    } catch (error) {
      this.setData({ error: error.message || '检测失败' })
    }
  },

  async remove(event) {
    const id = event.currentTarget.dataset.id
    try {
      const confirmed = await new Promise((resolve) => {
        wx.showModal({
          title: '确认删除',
          content: '删除此模型配置后不可恢复，是否继续？',
          success: (res) => resolve(res.confirm),
        })
      })
      if (!confirmed) return
      await callFunction('modelProfiles', { action: 'delete', id })
    } catch (error) {
      this.setData({ error: error.message || '删除失败' })
      return
    }
    const state = loadState()
    state.models = (state.models || []).filter((model) => model.id !== id)
    if (state.defaultTextModelId === id) state.defaultTextModelId = (state.models.find((m) => m.kind === 'text') || {}).id || ''
    if (state.defaultModelId === id) state.defaultModelId = (state.models.find((m) => (m.kind || 'image') === 'image') || {}).id || ''
    if (state.defaultVideoModelId === id) state.defaultVideoModelId = (state.models.find((m) => m.kind === 'video') || {}).id || ''
    saveState(state)
    this.setData({ models: state.models.filter(isThirdPartyModel).map(decorateModel) })
  },
})
