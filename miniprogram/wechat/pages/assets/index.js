const { callFunction } = require('../../utils/cloud')
const { loadState, saveState } = require('../../utils/state')
const { modeLabels } = require('../../utils/catalog')

Page({
  data: {
    tasks: [],
    visibleTasks: [],
    taskCountText: '共 0 个任务',
    favoriteFilterClass: '',
    hasTasks: false,
    modeLabels,
    onlyFavorite: false,
    error: '',
  },

  onShow() {
    this.loadTasks()
  },

  async loadTasks() {
    const state = loadState()
    this.applyTasks(state.tasks || [])
    callFunction('generationTasks', { action: 'list' })
      .then((tasks) => {
        const next = loadState()
        next.tasks = tasks
        saveState(next)
        this.applyTasks(tasks)
      })
      .catch(() => undefined)
  },

  toggleFilter() {
    const onlyFavorite = !this.data.onlyFavorite
    this.setData({ onlyFavorite, favoriteFilterClass: onlyFavorite ? 'active' : '' }, () => this.applyTasks(this.data.tasks))
  },

  applyTasks(tasks) {
    const normalized = (tasks || []).map((task) => ({
      ...task,
      modeLabel: modeLabels[task.mode] || task.mode,
      assets: (task.assets || []).map((asset) => ({
        ...asset,
        assetUrl: asset.remoteUrl || asset.dataUrl || '',
        favoriteText: asset.isFavorite ? '取消收藏' : '收藏',
      })),
    }))
    const visibleTasks = this.data.onlyFavorite
      ? normalized.map((task) => ({ ...task, assets: task.assets.filter((asset) => asset.isFavorite) })).filter((task) => task.assets.length)
      : normalized
    this.setData({
      tasks: normalized,
      visibleTasks,
      taskCountText: `共 ${normalized.length} 个任务`,
      hasTasks: normalized.length > 0,
    })
  },

  async toggleFavorite(event) {
    const { taskId, assetId } = event.currentTarget.dataset
    try {
      await callFunction('generationTasks', { action: 'toggleFavoriteAsset', taskId, assetId })
      const state = loadState()
      state.tasks = (state.tasks || []).map((task) => task.id !== taskId ? task : {
        ...task,
        assets: task.assets.map((asset) => asset.id === assetId ? { ...asset, isFavorite: !asset.isFavorite } : asset),
      })
      saveState(state)
      this.applyTasks(state.tasks)
    } catch (error) {
      this.setData({ error: error.message || '收藏失败' })
    }
  },

  async deleteTask(event) {
    const id = event.currentTarget.dataset.id
    await callFunction('generationTasks', { action: 'deleteTask', id }).catch(() => true)
    const state = loadState()
    state.tasks = (state.tasks || []).filter((task) => task.id !== id)
    saveState(state)
    this.applyTasks(state.tasks)
  },

  previewAsset(event) {
    const url = event.currentTarget.dataset.url
    if (url) wx.previewImage({ urls: [url], current: url })
  },
})
