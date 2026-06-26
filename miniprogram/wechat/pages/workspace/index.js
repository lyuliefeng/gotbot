const { tools, prompts, modeLabels } = require('../../utils/catalog')
const { callFunction } = require('../../utils/cloud')
const { loadState, saveState } = require('../../utils/state')
const { validateGenerationInput } = require('../../utils/validators')
const { resolveAssetUrls } = require('../../utils/assets')

function decorateTools(activeId) {
  return tools.map((tool) => ({
    ...tool,
    modeLabel: modeLabels[tool.mode] || tool.title,
    activeClass: tool.id === activeId ? 'active' : '',
  }))
}

Page({
  data: {
    tools,
    prompts,
    modeLabels,
    activeToolId: tools[0].id,
    activeTool: tools[0],
    allModels: [],
    models: [],
    toolTabs: decorateTools(tools[0].id),
    modelIndex: 0,
    selectedModelName: '暂无模型，请先去设置',
    prompt: '',
    negativePrompt: tools[0].negativeSeed || '低清晰度、变形、文字水印、错误构图',
    width: tools[0].width,
    height: tools[0].height,
    batchSize: 1,
    steps: 28,
    seed: Math.floor(Math.random() * 1000000),
    referenceImage: '',
    referenceBackdropVisible: false,
    currentTask: null,
    isVideoResult: false,
    currentAssets: [],
    composerOpen: false,
    composerMaskClass: '',
    composerPanelClass: '',
    composerTitle: tools[0].title,
    composerSubtitle: '图片通道 · 自动匹配图像模型',
    resolutionOptions: ['1024 x 1024', '1080 x 1440', '1280 x 720', '768 x 768'],
    resolutionIndex: 0,
    loading: false,
    polishingPrompt: false,
    polishingNegativePrompt: false,
    generateButtonText: '开始生成',
    polishPromptText: 'AI 提示词润色',
    polishNegativePromptText: 'AI 反向提示词润色',
    error: '',
    notice: '',
  },

  onShow() {
    const state = loadState()
    this.applyModelsForTool(this.data.activeTool, state.models || [], state)
    const activePrompt = wx.getStorageSync('gotbot-active-prompt')
    if (activePrompt) {
      wx.removeStorageSync('gotbot-active-prompt')
      this.setData({ prompt: activePrompt }, () => this.openComposer())
    }
  },

  openComposer() {
    if (this.data.composerOpen) {
      this.setData({ composerMaskClass: 'visible', composerPanelClass: 'visible' })
      return
    }
    this.setData({ composerOpen: true, composerMaskClass: '', composerPanelClass: '' })
    setTimeout(() => {
      this.setData({ composerMaskClass: 'visible', composerPanelClass: 'visible' })
    }, 20)
  },

  kindLabel(kind) {
    return kind === 'video' ? '视频' : '图片'
  },

  emptyModelText(kind) {
    return kind === 'video' ? '暂无视频模型，请先去设置' : '暂无图像模型，请先去设置'
  },

  defaultModelKey(kind) {
    return kind === 'video' ? 'defaultVideoModelId' : 'defaultModelId'
  },

  applyModelsForTool(tool, allModels, state) {
    const modelKind = tool.modelKind || 'image'
    const models = (allModels || []).filter((model) => (model.kind || 'image') === modelKind)
    const defaultId = state[this.defaultModelKey(modelKind)]
    const foundIndex = models.findIndex((model) => model.id === defaultId)
    const modelIndex = foundIndex >= 0 ? foundIndex : 0
    const selectedModel = models[modelIndex]
    this.setData({
      allModels: allModels || [],
      models,
      modelIndex,
      selectedModelName: selectedModel ? selectedModel.name : this.emptyModelText(modelKind),
      composerSubtitle: `${this.kindLabel(modelKind)}通道 · 自动匹配${this.kindLabel(modelKind)}模型`,
    })
  },

  selectTool(event) {
    const tool = tools.find((item) => item.id === event.currentTarget.dataset.id) || tools[0]
    const state = loadState()
    const resolutionLabel = `${tool.width} x ${tool.height}`
    const resolutionIndex = Math.max(0, this.data.resolutionOptions.indexOf(resolutionLabel))
    this.setData({
      activeToolId: tool.id,
      activeTool: tool,
      toolTabs: decorateTools(tool.id),
      composerTitle: tool.title,
      prompt: '',
      negativePrompt: tool.negativeSeed || this.data.negativePrompt,
      width: tool.width,
      height: tool.height,
      resolutionIndex,
      batchSize: tool.modelKind === 'video' ? 1 : this.data.batchSize,
      referenceBackdropVisible: Boolean(tool.referenceRequired && this.data.referenceImage),
      referenceImage: tool.referenceRequired ? this.data.referenceImage : '',
      error: '',
    }, () => this.openComposer())
    this.applyModelsForTool(tool, state.models || this.data.allModels || [], state)
  },

  closeComposer() {
    this.setData({ composerMaskClass: '', composerPanelClass: '', error: '', notice: '' })
    setTimeout(() => {
      this.setData({ composerOpen: false })
    }, 180)
  },

  noop() {},

  onResolutionChange(event) {
    const index = Number(event.detail.value)
    const label = this.data.resolutionOptions[index] || this.data.resolutionOptions[0]
    const parts = label.split(' x ').map((item) => Number(item))
    this.setData({ resolutionIndex: index, width: parts[0], height: parts[1] })
  },

  selectPrompt(event) {
    const prompt = prompts.find((item) => item.id === event.currentTarget.dataset.id)
    if (prompt) this.setData({ prompt: prompt.prompt })
  },

  onModelChange(event) {
    const index = Number(event.detail.value)
    const model = this.data.models[index]
    const state = loadState()
    const modelKind = this.data.activeTool.modelKind || 'image'
    state[this.defaultModelKey(modelKind)] = model && model.id
    saveState(state)
    this.setData({ modelIndex: index, selectedModelName: model ? model.name : this.emptyModelText(modelKind) })
  },

  onInput(event) {
    this.setData({ [event.currentTarget.dataset.field]: event.detail.value })
  },

  localPolishPrompt(text) {
    const source = text || `${this.data.activeTool.title}，主体明确，画面完整，适合商业创作`
    return `${source}，清晰主体，丰富细节，自然光影，构图稳定，高级质感，画面干净，适合移动端展示`
  },

  localPolishNegativePrompt(text) {
    const additions = ['低清晰度', '模糊', '变形', '文字水印', '错误手部', '画面撕裂', '重复主体', '畸形结构', '过曝', '低质感']
    const existing = new Set(String(text || '').split(/[，,]/).map((item) => item.trim()).filter(Boolean))
    additions.forEach((item) => existing.add(item))
    return Array.from(existing).join('，')
  },

  isPromptPolishMissing(error) {
    const message = error.message || error.errMsg || ''
    return message.includes('promptPolish') && message.includes('未部署')
  },

  async polishPrompt() {
    if (this.data.polishingPrompt) return
    const text = (this.data.prompt || '').trim()
    try {
      this.setData({ polishingPrompt: true, polishPromptText: '润色中', error: '', notice: '' })
      const result = await callFunction('promptPolish', {
        action: 'polish',
        type: 'prompt',
        text,
        toolTitle: this.data.activeTool.title,
      })
      this.setData({ prompt: result.text || text, notice: `已用 ${result.model || 'agnes-2.0-flash'} 润色提示词` })
    } catch (error) {
      if (this.isPromptPolishMissing(error)) {
        this.setData({ prompt: this.localPolishPrompt(text), notice: 'AI 润色云函数未部署，已先使用本地润色' })
      } else {
        this.setData({ error: error.message || '提示词润色失败' })
      }
    } finally {
      this.setData({ polishingPrompt: false, polishPromptText: 'AI 提示词润色' })
    }
  },

  async polishNegativePrompt() {
    if (this.data.polishingNegativePrompt) return
    const text = (this.data.negativePrompt || '').trim()
    try {
      this.setData({ polishingNegativePrompt: true, polishNegativePromptText: '润色中', error: '', notice: '' })
      const result = await callFunction('promptPolish', {
        action: 'polish',
        type: 'negative',
        text,
        toolTitle: this.data.activeTool.title,
      })
      this.setData({ negativePrompt: result.text || text, notice: `已用 ${result.model || 'agnes-2.0-flash'} 润色反向提示词` })
    } catch (error) {
      if (this.isPromptPolishMissing(error)) {
        this.setData({ negativePrompt: this.localPolishNegativePrompt(text), notice: 'AI 润色云函数未部署，已先使用本地润色' })
      } else {
        this.setData({ error: error.message || '反向提示词润色失败' })
      }
    } finally {
      this.setData({ polishingNegativePrompt: false, polishNegativePromptText: 'AI 反向提示词润色' })
    }
  },

  chooseReference() {
    wx.chooseMedia({ count: 1, mediaType: ['image'] })
      .then((res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (file) this.setData({ referenceImage: file.tempFilePath, referenceBackdropVisible: true })
      })
      .catch(() => undefined)
  },

  buildInput() {
    const model = this.data.models[this.data.modelIndex] || this.data.models[0]
    const assetKind = this.data.activeTool.modelKind === 'video' ? 'video' : 'image'
    return {
      mode: this.data.activeTool.mode,
      assetKind,
      prompt: this.data.prompt || this.data.activeTool.promptSeed,
      negativePrompt: this.data.negativePrompt,
      modelId: model ? model.id : '',
      width: Number(this.data.width),
      height: Number(this.data.height),
      batchSize: Number(this.data.batchSize),
      steps: Number(this.data.steps),
      seed: Math.floor(Math.random() * 1000000),
      style: '自然',
      referenceImage: this.data.referenceImage,
      modeOptions: { toolId: this.data.activeTool.id },
    }
  },

  async generate() {
    const input = this.buildInput()
    try {
      validateGenerationInput(input)
      this.setData({ loading: true, generateButtonText: '生成中', error: '', notice: '' })
      const task = await callFunction('generationTasks', { action: 'create', input })
      const assetKind = input.assetKind || (this.data.activeTool.modelKind === 'video' ? 'video' : 'image')
      const currentAssets = (await resolveAssetUrls(task.assets || [])).map((asset) => ({ ...asset, assetKind: asset.assetKind || assetKind }))
      const storedTask = { ...task, assetKind: task.assetKind || assetKind, assets: currentAssets }
      const state = loadState()
      state.tasks = [storedTask].concat((state.tasks || []).filter((item) => item.id !== task.id))
      saveState(state)
      this.setData({ composerOpen: false, currentTask: storedTask, currentAssets, isVideoResult: assetKind === 'video', notice: `已生成 ${currentAssets.length} 个结果` })
    } catch (error) {
      this.setData({ error: error.message || '生成失败' })
    } finally {
      this.setData({ loading: false, generateButtonText: '开始生成' })
    }
  },

  previewAsset(event) {
    const url = event.currentTarget.dataset.url
    if (!url) return
    wx.previewImage({ urls: [url], current: url })
  },

  saveAsset(event) {
    const url = event.currentTarget.dataset.url
    if (!url) return
    wx.downloadFile({ url })
      .then((res) => wx.saveImageToPhotosAlbum({ filePath: res.tempFilePath }))
      .then(() => wx.showToast({ title: '已保存', icon: 'success' }))
      .catch((err) => {
        const msg = String(err.errMsg || '').includes('auth deny') ? '请在设置中允许访问相册' : '保存失败'
        wx.showToast({ title: msg, icon: 'none' })
      })
  },
})
