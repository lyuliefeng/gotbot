const { defaultModels, prompts } = require('./catalog')

const KEY = 'gotbot-miniprogram-state'

function loadState() {
  const saved = wx.getStorageSync(KEY)
  if (saved && typeof saved === 'object') return saved
  return {
    models: defaultModels,
    prompts,
    tasks: [],
    defaultModelId: defaultModels[0].id,
  }
}

function saveState(next) {
  wx.setStorageSync(KEY, next)
}

function updateState(mutator) {
  const state = loadState()
  const next = mutator(state) || state
  saveState(next)
  return next
}

module.exports = { loadState, saveState, updateState }
