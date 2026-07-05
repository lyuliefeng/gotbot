const { callFunction } = require('../../utils/cloud')
const { applyDefaultModelIds, loadState, mergeModelsById, preferredModelForKind, saveState, visibleModels } = require('../../utils/state')

const nameOptions = [
  { label: '大语言模型', value: '第三方大语言模型', endpoint: '', model: '', kind: 'text' },
  { label: '生图接口', value: '第三方生图模型', endpoint: '', model: '', kind: 'image' },
  { label: '视频接口', value: '第三方视频模型', endpoint: '', model: '', kind: 'video' },
  { label: '自定义', value: '', kind: 'image' },
]
const customNameIndex = nameOptions.length - 1
const kindOptions = [
  { label: '大语言模型', value: 'text', hint: '用于文字对话、多模态识别、提示词处理等能力。' },
  { label: '生图模型', value: 'image', hint: '文生图、图生图、封面、ICON、3D 图和 GIF 会自动使用这个通道。' },
  { label: '视频模型', value: 'video', hint: '文生视频、图生视频会自动使用这个通道。' },
]

function apiProtocolForKind(kind) {
  if (kind === 'video') return 'openai-video'
  if (kind === 'image') return 'openai-images'
  return 'multimodal-chat'
}

function apiPathForKind(kind) {
  if (kind === 'video') return 'v1/video/generations'
  if (kind === 'image') return 'v1/images/generations'
  return 'v1/chat/completions'
}

function emptyDraft() {
  const kind = 'text'
  return {
    id: '',
    name: '第三方大语言模型',
    provider: 'openai-compatible',
    endpoint: '',
    apiPath: apiPathForKind(kind),
    apiProtocol: apiProtocolForKind(kind),
    apiKey: '',
    model: '',
    kind,
    keyMode: 'user',
    isPrimary: false,
    status: 'untested',
  }
}

function decorateModel(model, selectedModelId = '') {
  const kindLabel = currentKindOption(model.kind).shortLabel
  const latencyText = typeof model.latencyMs === 'number' ? ` · ${model.latencyMs}ms` : ''
  return {
    ...model,
    isSelected: model.id === selectedModelId,
    kindLabel,
    keyModeLabel: '第三方 Key',
    summary: `${kindLabel} · 第三方接口${latencyText} · ${model.model || '未选择模型'}`,
  }
}

function isBuiltinDefaultGroup(model) {
  return Boolean(model && (model.keyMode === 'platform' || String(model.id || '').startsWith('platform-') || /^默认(文字|图片|视频)组$/.test(String(model.name || ''))))
}

function settingsVisibleModels(models) {
  return visibleModels(models).filter((model) => !isBuiltinDefaultGroup(model))
}

function modelsMatchingKind(models, kind) {
  return (models || []).filter((model) => Boolean(model && (model.id || model.model)) && (model.kind || 'text') === kind)
}

function currentKindOption(kind) {
  const option = kindOptions.find((item) => item.value === kind) || kindOptions[0]
  return { ...option, shortLabel: option.value === 'text' ? '大语言' : option.value === 'video' ? '视频' : '生图' }
}

function endpointLabelForKind(kind) {
  if (kind === 'text') return '大语言模型接口地址'
  if (kind === 'video') return '视频模型接口地址'
  return '生图模型接口地址'
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
  if (/video|视频|生视频|文生视频|图生视频|wan|kling|hailuo|runway|pika|luma|sora|veo|seedance/.test(raw)) return 'video'
  if (/image|图片|图像|生图|文生图|图生图|img|flux|dall|gpt-image|midjourney|stable|sdxl|sd-|dream|recraft|ideogram|kolors|agnes-image/.test(raw)) return 'image'
  return 'text'
}

function applyModelDiscovery(models, kind) {
  const selected = preferredModelForKind(models, kind)
  const nextKind = selected ? selected.kind : kind
  const selectedIndex = selected ? models.findIndex((item) => item.id === selected.id) : -1
  return {
    modelOptions: models,
    modelIndex: selectedIndex,
    currentModelLabel: modelPickerLabel(models, selectedIndex),
    currentModelText: selected ? selected.id : '未选择模型',
    'draft.model': selected ? selected.id : '',
    'draft.kind': nextKind,
    'draft.apiProtocol': apiProtocolForKind(nextKind),
    'draft.apiPath': apiPathForKind(nextKind),
    kindIndex: Math.max(0, kindOptions.findIndex((item) => item.value === nextKind)),
    currentKindLabel: currentKindOption(nextKind).label,
    kindHint: currentKindOption(nextKind).hint,
    endpointLabel: endpointLabelForKind(nextKind),
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
    currentModelText: '请选择模型',
    nameIndex: 0,
    kindIndex: 0,
    showCustomName: false,
    kindHint: kindOptions[0].hint,
    endpointLabel: endpointLabelForKind(kindOptions[0].value),
    modelIndex: -1,
    isFetchingModels: false,
    showManualModelInput: true,
    notice: '',
    error: '',
    selectedModelId: '',
    formOpen: false,
    formTitle: '添加模型',
    hasModels: false,
    showEmptyModels: true,
  },

  onShow() {
    this.hydrateModelsFromState()
  },

  hydrateModelsFromState() {
    const state = loadState()
    const cachedModels = settingsVisibleModels(state.models).map((model) => decorateModel(model, this.data.selectedModelId))
    this.setData({ models: cachedModels, hasModels: cachedModels.length > 0, showEmptyModels: cachedModels.length === 0 })
  },

  applyModelProfiles(models, notice) {
    const state = loadState()
    state.models = models
    applyDefaultModelIds(state, models)
    saveState(state)
    const decorated = settingsVisibleModels(models).map((model) => decorateModel(model, this.data.selectedModelId))
    this.setData({ models: decorated, hasModels: decorated.length > 0, showEmptyModels: decorated.length === 0, notice })
  },

  openModelSettings() {
    this.openModelForm('text', '配置模型')
  },

  openModelForm(kind, title) {
    const preset = nameOptions.find((item) => item.kind === kind) || nameOptions[0]
    const kindIdx = kindOptions.findIndex((item) => item.value === kind)
    const draftKind = kind || 'text'
    this.setData({
      formOpen: true,
      formTitle: title || '添加模型',
      draft: { ...emptyDraft(), kind: draftKind, name: preset.value || '', apiPath: apiPathForKind(draftKind), apiProtocol: apiProtocolForKind(draftKind), keyMode: 'user' },
      nameIndex: preset.value ? nameOptions.indexOf(preset) : nameOptions.length - 1,
      currentNameLabel: preset.label,
      showCustomName: !preset.value,
      kindIndex: Math.max(0, kindIdx),
      currentKindLabel: currentKindOption(draftKind).label,
      kindHint: currentKindOption(draftKind).hint,
      endpointLabel: endpointLabelForKind(draftKind),
      modelOptions: [],
      modelIndex: -1,
      showManualModelInput: true,
      currentModelText: '请选择模型',
      notice: '',
      error: '',
    })
  },

  onQuickAdd(event) {
    const kind = event.currentTarget.dataset.kind
    const titleMap = { image: '添加生图模型', text: '添加大语言模型' }
    this.openModelForm(kind, titleMap[kind] || '添加模型')
  },

  closeForm() {
    this.setData({ formOpen: false, notice: '', error: '' })
  },

  noop() {},

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
      next['draft.apiProtocol'] = apiProtocolForKind(preset.kind || 'image')
      next['draft.apiPath'] = apiPathForKind(preset.kind || 'image')
      next['draft.keyMode'] = 'user'
      next.kindIndex = Math.max(0, kindOptions.findIndex((item) => item.value === (preset.kind || 'image')))
      next.currentKindLabel = currentKindOption(preset.kind).label
      next.kindHint = currentKindOption(preset.kind).hint
      next.endpointLabel = endpointLabelForKind(preset.kind || 'image')
      next.modelOptions = []
      next.modelIndex = -1
      next.showManualModelInput = true
      next.currentModelText = preset.model || '请选择模型'
    } else {
      next['draft.name'] = ''
      next['draft.kind'] = 'text'
      next['draft.apiProtocol'] = apiProtocolForKind('text')
      next['draft.apiPath'] = apiPathForKind('text')
      next['draft.keyMode'] = 'user'
      next.kindIndex = 0
      next.currentKindLabel = kindOptions[0].label
      next.kindHint = kindOptions[0].hint
      next.endpointLabel = endpointLabelForKind('text')
      next.modelOptions = []
      next.modelIndex = -1
      next.showManualModelInput = true
      next.currentModelText = '请选择模型'
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
      'draft.name': (nameOptions.find((item) => item.kind === option.value) || nameOptions[0]).value,
      'draft.apiProtocol': apiProtocolForKind(option.value),
      'draft.apiPath': apiPathForKind(option.value),
      'draft.model': '',
      kindHint: option.hint,
      endpointLabel: endpointLabelForKind(option.value),
      modelOptions: [],
      modelIndex: -1,
      currentModelLabel: '选择模型：请选择',
      currentModelText: '未选择模型',
      showManualModelInput: true,
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
      'draft.apiProtocol': apiProtocolForKind(model.kind || this.data.draft.kind),
      'draft.apiPath': apiPathForKind(model.kind || this.data.draft.kind),
      kindIndex: Math.max(0, kindOptions.findIndex((item) => item.value === (model.kind || this.data.draft.kind))),
      currentKindLabel: currentKindOption(model.kind || this.data.draft.kind).label,
      kindHint: currentKindOption(model.kind || this.data.draft.kind).hint,
      endpointLabel: endpointLabelForKind(model.kind || this.data.draft.kind),
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
    callFunction('modelProfiles', { action: 'discover', profile: { ...draft, apiProtocol: apiProtocolForKind(draft.kind), apiPath: apiPathForKind(draft.kind) } })
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
    const targetKind = draft.kind || 'text'
    const scopedModels = modelsMatchingKind(models, targetKind)
    if (!scopedModels.length) throw new Error(`没有拉取到${currentKindOption(targetKind).shortLabel}模型`)
    const profiles = scopedModels.map((model) => ({
      name: `${currentKindOption(model.kind).shortLabel} · ${model.name || model.id}`,
      provider: 'openai-compatible',
      endpoint: normalizeEndpoint(draft.endpoint),
      apiPath: apiPathForKind(model.kind || targetKind),
      apiProtocol: apiProtocolForKind(model.kind || targetKind),
      apiKey: draft.apiKey,
      model: model.id,
      kind: model.kind || 'text',
      keyMode: 'user',
      latencyMs: typeof model.latencyMs === 'number' ? model.latencyMs : latencyMs,
      status: 'untested',
    }))
    const saved = await callFunction('modelProfiles', { action: 'saveMany', profiles })
    const state = loadState()
    state.models = mergeModelsById(state.models || [], saved)
    const textDefault = preferredModelForKind(saved, 'text')
    const imageDefault = preferredModelForKind(saved, 'image')
    const videoDefault = preferredModelForKind(saved, 'video')
    if (textDefault) state.defaultTextModelId = textDefault.id
    if (imageDefault) state.defaultModelId = imageDefault.id
    if (videoDefault) state.defaultVideoModelId = videoDefault.id
    saveState(state)
    const counts = modelCounts(saved)
    const next = applyModelDiscovery(scopedModels, targetKind)
    const visible = settingsVisibleModels(state.models)
    this.setData({
      ...next,
      models: visible.map((model) => decorateModel(model, this.data.selectedModelId)),
      hasModels: visible.length > 0,
      showEmptyModels: visible.length === 0,
      showManualModelInput: false,
      isFetchingModels: false,
      notice: `已自动导入 ${saved.length} 个${currentKindOption(targetKind).shortLabel}模型：大语言 ${counts.text}，生图 ${counts.image}，视频 ${counts.video}`,
      error: '',
    })
  },

  onModelCardTap(event) {
    const id = event.currentTarget.dataset.id
    const selectedModelId = this.data.selectedModelId === id ? '' : id
    this.setData({
      selectedModelId,
      models: this.data.models.map((model) => decorateModel(model, selectedModelId)),
    })
  },

  edit(event) {
    const model = this.data.models.find((item) => item.id === event.currentTarget.dataset.id)
    if (!model) return
    this.setData({
      draft: { ...emptyDraft(), ...model, apiProtocol: apiProtocolForKind(model.kind), apiPath: apiPathForKind(model.kind), endpoint: normalizeEndpoint(model.endpoint), apiKey: '', keyMode: 'user' },
      nameIndex: customNameIndex,
      currentNameLabel: nameOptions[customNameIndex].label,
      showCustomName: true,
      kindIndex: Math.max(0, kindOptions.findIndex((item) => item.value === (model.kind || 'image'))),
      currentKindLabel: currentKindOption(model.kind).label,
      kindHint: currentKindOption(model.kind).hint,
      endpointLabel: endpointLabelForKind(model.kind || 'image'),
      modelOptions: [],
      modelIndex: -1,
      currentModelLabel: '选择模型：请选择',
      currentModelText: model.model || '未选择模型',
      showManualModelInput: false,
      selectedModelId: '',
      formOpen: true,
      formTitle: '编辑模型',
    })
  },

  async save() {
    try {
      const draft = this.data.draft
      const saved = await callFunction('modelProfiles', { action: 'save', profile: { ...draft, keyMode: 'user', apiProtocol: apiProtocolForKind(draft.kind), apiPath: apiPathForKind(draft.kind), endpoint: normalizeEndpoint(draft.endpoint) } })
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
      const visible = settingsVisibleModels(models)
      this.setData({
        models: visible.map((model) => decorateModel(model, this.data.selectedModelId)),
        hasModels: visible.length > 0,
        showEmptyModels: visible.length === 0,
        draft: emptyDraft(),
        nameIndex: 0,
        currentNameLabel: nameOptions[0].label,
        kindIndex: 0,
        currentKindLabel: kindOptions[0].label,
        kindHint: kindOptions[0].hint,
        endpointLabel: endpointLabelForKind(kindOptions[0].value),
        showCustomName: false,
        modelOptions: [],
        modelIndex: -1,
        currentModelLabel: '选择模型：请选择',
        currentModelText: '请选择模型',
        showManualModelInput: true,
        notice: '模型配置已保存',
        error: '',
        formOpen: false,
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
        : await callFunction('modelProfiles', { action: 'test', profile: { ...draft, keyMode: 'user', apiProtocol: apiProtocolForKind(draft.kind), apiPath: apiPathForKind(draft.kind), endpoint: normalizeEndpoint(draft.endpoint) } })
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
    if (state.defaultTextModelId === id) state.defaultTextModelId = (preferredModelForKind(state.models, 'text') || {}).id || ''
    if (state.defaultModelId === id) state.defaultModelId = (preferredModelForKind(state.models, 'image') || {}).id || ''
    saveState(state)
    const visible = settingsVisibleModels(state.models).map((model) => decorateModel(model, ''))
    this.setData({ models: visible, hasModels: visible.length > 0, showEmptyModels: visible.length === 0, selectedModelId: '' })
  },
})
