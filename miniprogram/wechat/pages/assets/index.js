const { callFunction } = require('../../utils/cloud')
const { loadState, saveState } = require('../../utils/state')
const { modeLabels } = require('../../utils/catalog')
const { resolveTaskAssetUrls } = require('../../utils/assets')

Page({
  data: {
    tasks: [],
    visibleAssets: [],
    imageCountText: '图片 0',
    videoCountText: '视频 0',
    favoriteCountText: '收藏 0',
    libraryTitle: '图片仓库',
    librarySummary: '共 0 个图片资产',
    activeLibrary: 'image',
    imageTabClass: 'active',
    videoTabClass: '',
    favoriteTabClass: '',
    favoriteFilterClass: '',
    hasVisibleAssets: false,
    emptyText: '还没有图片资产，去创作页生成第一张图片。',
    modeLabels,
    onlyFavorite: false,
    error: '',
  },

  onShow() {
    this.loadTasks()
  },

  async loadTasks() {
    const state = loadState()
    this.applyTasks(await resolveTaskAssetUrls(state.tasks || []))
    callFunction('generationTasks', { action: 'list' })
      .then(async (tasks) => {
        const resolvedTasks = await resolveTaskAssetUrls(tasks)
        const next = loadState()
        next.tasks = resolvedTasks
        saveState(next)
        this.applyTasks(resolvedTasks)
      })
      .catch(() => undefined)
  },

  toggleFilter() {
    this.setData({
      activeLibrary: 'favorite',
      onlyFavorite: true,
      imageTabClass: '',
      videoTabClass: '',
      favoriteTabClass: 'active',
      favoriteFilterClass: 'active',
    }, () => this.applyTasks(this.data.tasks))
  },

  switchLibrary(event) {
    const library = event.currentTarget.dataset.library || 'image'
    this.setData({
      activeLibrary: library,
      onlyFavorite: library === 'favorite',
      imageTabClass: library === 'image' ? 'active' : '',
      videoTabClass: library === 'video' ? 'active' : '',
      favoriteTabClass: library === 'favorite' ? 'active' : '',
      favoriteFilterClass: library === 'favorite' ? 'active' : '',
    }, () => this.applyTasks(this.data.tasks))
  },

  applyTasks(tasks) {
    const normalized = (tasks || []).map((task) => ({
      ...task,
      modeLabel: modeLabels[task.mode] || task.mode,
      assetKind: task.assetKind || (task.mode === 'txt2video' || task.mode === 'img2video' ? 'video' : 'image'),
      assets: (task.assets || []).map((asset) => ({
        ...asset,
        taskId: task.id,
        taskPrompt: task.prompt,
        taskModeLabel: modeLabels[task.mode] || task.mode,
        taskCreatedAt: task.createdAt,
        assetKind: asset.assetKind || task.assetKind || (task.mode === 'txt2video' || task.mode === 'img2video' ? 'video' : 'image'),
        assetUrl: asset.assetUrl || asset.remoteUrl || asset.dataUrl || '',
        favoriteText: asset.isFavorite ? '取消收藏' : '收藏',
      })),
    }))
    const allAssets = normalized.reduce((items, task) => items.concat(task.assets || []), [])
    const imageAssets = allAssets.filter((asset) => asset.assetKind === 'image')
    const videoAssets = allAssets.filter((asset) => asset.assetKind === 'video')
    const favoriteAssets = allAssets.filter((asset) => asset.isFavorite)
    const activeAssets = this.data.activeLibrary === 'favorite'
      ? favoriteAssets
      : this.data.activeLibrary === 'video'
        ? videoAssets
        : imageAssets
    const libraryTitle = this.data.activeLibrary === 'favorite' ? '收藏仓库' : this.data.activeLibrary === 'video' ? '视频仓库' : '图片仓库'
    const librarySummary = this.data.activeLibrary === 'favorite'
      ? `共 ${favoriteAssets.length} 个收藏资产`
      : this.data.activeLibrary === 'video'
        ? `共 ${videoAssets.length} 个视频资产`
        : `共 ${imageAssets.length} 个图片资产`
    this.setData({
      tasks: normalized,
      visibleAssets: activeAssets,
      imageCountText: `图片 ${imageAssets.length}`,
      videoCountText: `视频 ${videoAssets.length}`,
      favoriteCountText: `收藏 ${favoriteAssets.length}`,
      libraryTitle,
      librarySummary,
      hasVisibleAssets: activeAssets.length > 0,
      emptyText: this.data.activeLibrary === 'favorite' ? '还没有收藏资产，点亮喜欢的作品后会出现在这里。' : this.data.activeLibrary === 'video' ? '还没有视频资产，去创作页生成第一段视频。' : '还没有图片资产，去创作页生成第一张图片。',
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
