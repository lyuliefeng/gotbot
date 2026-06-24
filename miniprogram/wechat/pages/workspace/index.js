const { tools, prompts, modeLabels } = require('../../utils/catalog')
const { callFunction } = require('../../utils/cloud')
const { loadState, saveState } = require('../../utils/state')
const { validateGenerationInput } = require('../../utils/validators')
const { resolveAssetUrls } = require('../../utils/assets')

Page({
  data: {
    tools,
    prompts,
    modeLabels,
    activeToolId: tools[0].id,
    activeTool: tools[0],
    models: [],
    toolTabs: tools.map((tool, index) => ({ ...tool, activeClass: index === 0 ? 'active' : '' })),
    modelIndex: 0,
    selectedModelName: '暂无模型，请先去设置',
    prompt: tools[0].promptSeed,
    negativePrompt: tools[0].negativeSeed || '低清晰度、变形、文字水印、错误构图',
    width: tools[0].width,
    height: tools[0].height,
    batchSize: 1,
    steps: 28,
    seed: 128409,
    referenceImage: '',
    currentTask: null,
    currentAssets: [],
    loading: false,
    generateButtonText: '开始生成',
    error: '',
    notice: '',
  },

  onShow() {
    const state = loadState()
    const models = state.models || []
    const modelIndex = Math.max(0, models.findIndex((model) => model.id === state.defaultModelId))
    const selectedModel = models[modelIndex]
    this.setData({
      models,
      modelIndex,
      selectedModelName: selectedModel ? selectedModel.name : '暂无模型，请先去设置',
    })
  },

  selectTool(event) {
    const tool = tools.find((item) => item.id === event.currentTarget.dataset.id) || tools[0]
    this.setData({
      activeToolId: tool.id,
      activeTool: tool,
      toolTabs: tools.map((item) => ({ ...item, activeClass: item.id === tool.id ? 'active' : '' })),
      prompt: this.data.prompt || tool.promptSeed,
      negativePrompt: tool.negativeSeed || this.data.negativePrompt,
      width: tool.width,
      height: tool.height,
      error: '',
    })
  },

  selectPrompt(event) {
    const prompt = prompts.find((item) => item.id === event.currentTarget.dataset.id)
    if (prompt) this.setData({ prompt: prompt.prompt })
  },

  onModelChange(event) {
    const index = Number(event.detail.value)
    const model = this.data.models[index]
    const state = loadState()
    state.defaultModelId = model && model.id
    saveState(state)
    this.setData({ modelIndex: index, selectedModelName: model ? model.name : '暂无模型，请先去设置' })
  },

  onInput(event) {
    this.setData({ [event.currentTarget.dataset.field]: event.detail.value })
  },

  chooseReference() {
    wx.chooseMedia({ count: 1, mediaType: ['image'] })
      .then((res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (file) this.setData({ referenceImage: file.tempFilePath })
      })
      .catch(() => undefined)
  },

  buildInput() {
    const model = this.data.models[this.data.modelIndex] || this.data.models[0]
    return {
      mode: this.data.activeTool.mode,
      prompt: [this.data.prompt, this.data.activeTool.promptSeed].filter(Boolean).join(', '),
      negativePrompt: this.data.negativePrompt,
      modelId: model ? model.id : '',
      width: Number(this.data.width),
      height: Number(this.data.height),
      batchSize: Number(this.data.batchSize),
      steps: Number(this.data.steps),
      seed: Number(this.data.seed),
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
      const currentAssets = await resolveAssetUrls(task.assets || [])
      const state = loadState()
      state.tasks = [{ ...task, assets: currentAssets }].concat((state.tasks || []).filter((item) => item.id !== task.id))
      saveState(state)
      this.setData({ currentTask: { ...task, assets: currentAssets }, currentAssets, notice: `已生成 ${currentAssets.length} 个结果` })
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
    wx.downloadFile({ url }).then((res) => wx.saveImageToPhotosAlbum({ filePath: res.tempFilePath }))
  },
})
