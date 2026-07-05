const { tools, prompts, modeLabels } = require('../../utils/catalog')
const { callFunction, uploadCloudFile } = require('../../utils/cloud')
const { loadState, modelsForKind, saveState } = require('../../utils/state')
const { validateGenerationInput } = require('../../utils/validators')
const { resolveAssetUrls } = require('../../utils/assets')

const AUTO_MODEL_ID = '__auto__'
const MANUAL_MODEL_PREFIX = '手动匹配'

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
    manualModelEnabled: false,
    modelMatchModeLabel: '自动匹配',
    modelMatchModeHint: '系统按当前创作类型自动匹配可用模型',
    selectedModelName: '自动匹配',
    selectedModelKindLabel: '自动匹配',
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
    resolutionOptions: ['1024 x 1024', '4096 x 4096', '1080 x 1440', '1280 x 720', '768 x 768'],
    resolutionIndex: 0,
    loading: false,
    polishingPrompt: false,
    polishingNegativePrompt: false,
    generateButtonText: '开始生成',
    polishPromptText: 'AI 提示词润色',
    promptPlaceholder: tools[0].mode === 'gif' ? '描述动作、运动轨迹和节奏' : '描述主体、风格、光线和场景',
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
    if (kind === 'text') return '文字/多模态'
    if (kind === 'video') return '视频'
    return '生图'
  },

  emptyModelText(kind) {
    if (kind === 'text') return '暂无文字/多模态模型，请先去设置'
    if (kind === 'video') return '暂无视频模型，请先去设置'
    return '暂无图像模型，请先去设置'
  },

  defaultModelKey(kind) {
    if (kind === 'video') return 'defaultVideoModelId'
    return 'defaultModelId'
  },

  autoModelOption(kind) {
    return {
      id: AUTO_MODEL_ID,
      name: `自动匹配（${this.kindLabel(kind)}）`,
      kind,
      kindLabel: '自动匹配',
      model: '',
      isAuto: true,
    }
  },

  decorateModelOption(model) {
    const kind = model.kind || 'image'
    return {
      ...model,
      kindLabel: this.kindLabel(kind),
      name: `${MANUAL_MODEL_PREFIX} · ${this.kindLabel(kind)} · ${model.name || model.model}`,
      isManual: true,
    }
  },

  isHiddenManualModel(model) {
    return Boolean(model && (model.keyMode === 'platform' || String(model.id || '').startsWith('platform-')))
  },

  applyModelsForTool(tool, allModels, state) {
    const modelKind = tool.modelKind || 'image'
    const thirdPartyModels = modelsForKind(allModels, modelKind, { includePlatform: true })
      .filter((model) => !this.isHiddenManualModel(model))
      .map((model) => this.decorateModelOption(model))
    const defaultId = state[this.defaultModelKey(modelKind)]
    const foundIndex = thirdPartyModels.findIndex((model) => model.id === defaultId)
    const modelIndex = foundIndex >= 0 ? foundIndex : 0
    const selectedModel = this.autoModelOption(modelKind)
    this.setData({
      allModels: allModels || [],
      models: thirdPartyModels,
      modelIndex,
      manualModelEnabled: false,
      modelMatchModeLabel: '自动匹配',
      modelMatchModeHint: `系统按${this.kindLabel(modelKind)}类型自动匹配可用模型`,
      selectedModelName: selectedModel.name,
      selectedModelKindLabel: selectedModel.kindLabel,
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
      batchSize: this.data.batchSize,
      referenceBackdropVisible: Boolean(tool.referenceRequired && this.data.referenceImage),
      referenceImage: tool.referenceRequired ? this.data.referenceImage : '',
      error: '',
      promptPlaceholder: tool.modelKind === 'video'
        ? '描述主体、动作、场景、景别和镜头运动'
        : tool.mode === 'gif'
          ? '描述动作、景别、运动轨迹和节奏'
          : '描述主体、景别、风格、光线和场景',
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
    state[this.defaultModelKey(modelKind)] = model ? model.id : ''
    saveState(state)
    this.setData({
      modelIndex: index,
      manualModelEnabled: true,
      modelMatchModeLabel: '手动匹配',
      modelMatchModeHint: `手动使用已匹配的${this.kindLabel(modelKind)}模型`,
      selectedModelName: model ? model.name : this.emptyModelText(modelKind),
      selectedModelKindLabel: model ? model.kindLabel : this.kindLabel(modelKind),
    })
  },

  onModelMatchModeChange(event) {
    const manualModelEnabled = Boolean(event.detail.value)
    const modelKind = this.data.activeTool.modelKind || 'image'
    if (!manualModelEnabled) {
      const autoModel = this.autoModelOption(modelKind)
      this.setData({
        manualModelEnabled: false,
        modelMatchModeLabel: '自动匹配',
        modelMatchModeHint: `系统按${this.kindLabel(modelKind)}类型自动匹配可用模型`,
        selectedModelName: autoModel.name,
        selectedModelKindLabel: autoModel.kindLabel,
      })
      return
    }
    const selected = this.data.models[this.data.modelIndex] || this.data.models[0]
    this.setData({
      manualModelEnabled: true,
      modelIndex: selected ? this.data.models.findIndex((model) => model.id === selected.id) : 0,
      modelMatchModeLabel: '手动匹配',
      modelMatchModeHint: selected ? `手动使用已匹配的${this.kindLabel(modelKind)}模型` : this.emptyModelText(modelKind),
      selectedModelName: selected ? selected.name : this.emptyModelText(modelKind),
      selectedModelKindLabel: selected ? selected.kindLabel : this.kindLabel(modelKind),
    })
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
      .then(async (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file) return
        this.setData({ referenceImage: file.tempFilePath, referenceBackdropVisible: true, notice: '参考图上传中…' })
        try {
          const extension = String(file.tempFilePath || '').split('.').pop() || 'jpg'
          const cloudFileId = await uploadCloudFile(`references/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`, file.tempFilePath)
          this.setData({ referenceImage: cloudFileId, notice: '参考图已上传' })
        } catch (error) {
          this.setData({ notice: '参考图已选择，上传云存储失败时仅本地预览可用', error: error.message || '' })
        }
      })
      .catch(() => undefined)
  },

  buildInput() {
    const model = this.data.manualModelEnabled && this.data.modelIndex >= 0 ? this.data.models[this.data.modelIndex] : null
    const modelKind = this.data.activeTool.modelKind || 'image'
    const state = loadState()
    const assetKind = modelKind === 'video' ? 'video' : 'image'
    const modelId = model ? model.id : state[this.defaultModelKey(modelKind)] || ''
    return {
      mode: this.data.activeTool.mode,
      assetKind,
      prompt: this.data.prompt || this.data.activeTool.promptSeed,
      negativePrompt: this.data.negativePrompt,
      modelId,
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
      if (!task || !task.assets) throw new Error('云函数未返回生成结果')
      const assetKind = input.assetKind || 'image'
      const currentAssets = (await resolveAssetUrls(task.assets || [])).map((asset) => {
        const resolvedKind = asset.assetKind || assetKind
        return { ...asset, assetKind: resolvedKind, isVideo: resolvedKind === 'video' }
      })
      const storedTask = { ...task, assetKind: task.assetKind || assetKind, assets: currentAssets }
      const state = loadState()
      state.tasks = [storedTask].concat((state.tasks || []).filter((item) => item.id !== task.id))
      saveState(state)
      this.setData({ composerOpen: false, currentTask: storedTask, currentAssets, isVideoResult: assetKind === 'video' })
      wx.showToast({ title: `已生成 ${currentAssets.length} 个结果`, icon: 'success' })
      this.autoSaveAssets(currentAssets)
    } catch (error) {
      this.setData({ error: error.message || '生成失败' })
    } finally {
      this.setData({ loading: false, generateButtonText: '开始生成' })
    }
  },

  autoSaveAssets(assets) {
    let saved = 0
    let failed = 0
    const total = assets.length
    assets.forEach((asset) => {
      const url = asset.assetUrl
      if (!url) { failed++; return }
      wx.downloadFile({ url })
        .then((res) => {
          if (asset.assetKind === 'video') return wx.saveVideoToPhotosAlbum({ filePath: res.tempFilePath })
          return wx.saveImageToPhotosAlbum({ filePath: res.tempFilePath })
        })
        .then(() => { saved++ })
        .catch(() => { failed++ })
        .then(() => {
          if (saved + failed === total && saved > 0) {
            wx.showToast({ title: `已存入相册 ${saved} 张`, icon: 'success' })
          }
        })
    })
  },

  previewAsset(event) {
    const url = event.currentTarget.dataset.url
    if (!url) return
    wx.previewImage({ urls: [url], current: url })
  },

  saveAsset(event) {
    const url = event.currentTarget.dataset.url
    if (!url) return
    const isVideo = this.data.isVideoResult
    wx.downloadFile({ url })
      .then((res) => {
        if (isVideo) return wx.saveVideoToPhotosAlbum({ filePath: res.tempFilePath })
        return wx.saveImageToPhotosAlbum({ filePath: res.tempFilePath })
      })
      .then(() => wx.showToast({ title: '已保存', icon: 'success' }))
      .catch((err) => {
        const msg = String(err.errMsg || '').includes('auth deny') ? '请在设置中允许访问相册' : '保存失败'
        wx.showToast({ title: msg, icon: 'none' })
      })
  },
})
