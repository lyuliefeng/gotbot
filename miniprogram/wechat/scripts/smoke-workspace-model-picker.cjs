const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const storage = new Map()
let pageConfig

global.wx = {
  getStorageSync(key) {
    return storage.get(key)
  },
  setStorageSync(key, value) {
    storage.set(key, value)
  },
}

global.Page = (config) => {
  pageConfig = config
}

const moduleCache = new Map()

function loadWechatModule(file) {
  const resolved = path.resolve(file)
  if (moduleCache.has(resolved)) return moduleCache.get(resolved).exports
  const source = fs.readFileSync(resolved, 'utf8')
  const module = { exports: {} }
  moduleCache.set(resolved, module)
  const dirname = path.dirname(resolved)
  const localRequire = (request) => {
    if (request.startsWith('.')) {
      const child = path.resolve(dirname, request.endsWith('.js') ? request : `${request}.js`)
      return loadWechatModule(child)
    }
    return require(request)
  }
  const wrapped = `(function(require, module, exports, wx, Page) {\n${source}\n})`
  vm.runInNewContext(wrapped, { wx, Page, console })(localRequire, module, module.exports, wx, Page)
  return module.exports
}

function createPageInstance(config) {
  return {
    ...config,
    data: JSON.parse(JSON.stringify(config.data)),
    setData(patch) {
      Object.assign(this.data, patch)
    },
  }
}

loadWechatModule(path.resolve(__dirname, '../pages/workspace/index.js'))
assert.equal(typeof pageConfig.applyModelsForTool, 'function')

const page = createPageInstance(pageConfig)
const state = {
  defaultModelId: 'image-a',
  defaultVideoModelId: 'video-a',
  models: [
    { id: 'image-a', name: '识别出的图片模型', model: 'image-a', kind: 'image', keyMode: 'user' },
    { id: 'video-a', name: '识别出的视频模型', model: 'video-a', kind: 'video', keyMode: 'user' },
    { id: 'text-a', name: '识别出的文字模型', model: 'text-a', kind: 'text', keyMode: 'user' },
  ],
}
wx.setStorageSync('gotbot-miniprogram-state', state)

page.applyModelsForTool(page.data.activeTool, state.models, state)
assert.equal(page.data.manualModelEnabled, false)
assert.equal(page.data.selectedModelName, '自动匹配（生图）')
assert.equal(page.data.modelMatchModeLabel, '自动匹配')
assert.equal(page.data.modelIndex, 0)
assert.equal(page.data.models[0].id, 'image-a')
assert.equal(page.data.models[0].name, '手动匹配 · 生图 · 识别出的图片模型')
assert.equal(page.data.models[0].isManual, true)
assert.equal(page.data.models.some((model) => model.id === 'video-a'), false)
assert.equal(page.data.selectedModelKindLabel, '自动匹配')
assert.equal(page.buildInput().modelId, 'image-a')

page.onModelMatchModeChange({ detail: { value: true } })
assert.equal(page.data.manualModelEnabled, true)
assert.equal(page.data.modelMatchModeLabel, '手动匹配')
assert.equal(page.data.selectedModelName, '手动匹配 · 生图 · 识别出的图片模型')
assert.equal(page.data.selectedModelKindLabel, '生图')
assert.equal(page.buildInput().modelId, 'image-a')

page.onModelChange({ detail: { value: 0 } })
assert.equal(page.data.selectedModelName, '手动匹配 · 生图 · 识别出的图片模型')
assert.equal(page.buildInput().modelId, 'image-a')

page.onModelMatchModeChange({ detail: { value: false } })
assert.equal(page.data.manualModelEnabled, false)
assert.equal(page.data.selectedModelName, '自动匹配（生图）')
assert.equal(page.buildInput().modelId, 'image-a')

const videoTool = page.data.tools.find((tool) => tool.modelKind === 'video')
page.setData({ activeTool: videoTool, activeToolId: videoTool.id })
page.applyModelsForTool(videoTool, state.models, state)
assert.equal(page.data.selectedModelName, '自动匹配（视频）')
assert.equal(page.data.models.some((model) => model.id === 'video-a'), true)
assert.equal(page.data.models.some((model) => model.kind !== 'video'), false)
assert.equal(page.buildInput().modelId, 'video-a')

console.log('Workspace model picker smoke verified.')
