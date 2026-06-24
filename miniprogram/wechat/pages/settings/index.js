const { callFunction } = require('../../utils/cloud')
const { loadState, saveState } = require('../../utils/state')

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

function decorateModel(model) {
  return {
    ...model,
    keyModeLabel: model.keyMode === 'platform' ? '平台 Key' : '用户 Key',
    summary: `${model.apiProtocol} · ${model.keyMode === 'platform' ? '平台 Key' : '用户 Key'}`,
  }
}

Page({
  data: {
    models: [],
    draft: emptyDraft(),
    protocolOptions,
    keyModeOptions,
    protocolIndex: 0,
    keyModeIndex: 0,
    showUserKeyFields: true,
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
      draft: { ...model, apiKey: '', apiSecret: '' },
      protocolIndex: Math.max(0, protocolOptions.indexOf(model.apiProtocol)),
      keyModeIndex: Math.max(0, keyModeOptions.indexOf(model.keyMode)),
      showUserKeyFields: model.keyMode === 'user',
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
      state.defaultModelId = state.defaultModelId || saved.id
      saveState(state)
      this.setData({ models: models.map(decorateModel), draft: emptyDraft(), showUserKeyFields: true, notice: '模型配置已保存', error: '' })
    } catch (error) {
      this.setData({ error: error.message || '保存失败' })
    }
  },

  async testModel() {
    try {
      const result = await callFunction('modelProfiles', { action: 'test', profile: this.data.draft })
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
    saveState(state)
    this.setData({ models: state.models.map(decorateModel) })
  },
})
