const { prompts } = require('../../utils/catalog')
const { callFunction } = require('../../utils/cloud')
const { loadState, saveState } = require('../../utils/state')

Page({
  data: {
    prompts,
    keyword: '',
    notice: '',
    error: '',
  },

  onShow() {
    const state = loadState()
    this.setData({ prompts: state.prompts || prompts })
  },

  onSearch(event) {
    const keyword = event.detail.value
    const state = loadState()
    const source = state.prompts || prompts
    const lower = keyword.trim().toLowerCase()
    this.setData({
      keyword,
      prompts: lower ? source.filter((item) => `${item.title} ${item.prompt} ${item.promptEn || ''} ${item.category}`.toLowerCase().includes(lower)) : source,
    })
  },

  async sync(event) {
    const source = event.currentTarget.dataset.source
    try {
      const items = await callFunction('promptPacks', { action: 'sync', source })
      const state = loadState()
      const existing = state.prompts || prompts
      const ids = new Set(existing.map((item) => item.id))
      state.prompts = existing.concat(items.filter((item) => !ids.has(item.id)))
      saveState(state)
      this.setData({ prompts: state.prompts, notice: `已同步 ${items.length} 条提示词`, error: '' })
    } catch (error) {
      this.setData({ error: error.message || '同步失败' })
    }
  },

  usePrompt(event) {
    wx.setStorageSync('gotbot-active-prompt', event.currentTarget.dataset.prompt)
    wx.switchTab({ url: '/pages/workspace/index' })
  },
})
