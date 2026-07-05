const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const storage = new Map()
const savedProfiles = []
let pageConfig

global.wx = {
  getStorageSync(key) {
    return storage.get(key)
  },
  setStorageSync(key, value) {
    storage.set(key, value)
  },
  request() {},
}

global.Page = (config) => {
  pageConfig = config
}

const moduleCache = new Map()

function mockCloud() {
  return {
    callFunction(name, payload) {
      assert.equal(name, 'modelProfiles')
      if (payload.action === 'saveMany') {
        savedProfiles.push(...payload.profiles)
        return Promise.resolve(payload.profiles.map((profile, index) => ({ ...profile, id: `saved-${index}` })))
      }
      if (payload.action === 'save') return Promise.resolve({ ...payload.profile, id: 'saved-single' })
      if (payload.action === 'test') return Promise.resolve({ message: '检测通过' })
      return Promise.resolve({ models: [] })
    },
  }
}

function loadWechatModule(file) {
  const resolved = path.resolve(file)
  if (resolved.endsWith('/utils/cloud.js')) return mockCloud()
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

function setByPath(target, key, value) {
  const parts = key.split('.')
  let current = target
  for (let index = 0; index < parts.length - 1; index += 1) {
    current[parts[index]] = current[parts[index]] || {}
    current = current[parts[index]]
  }
  current[parts[parts.length - 1]] = value
}

function createPageInstance(config) {
  return {
    ...config,
    data: JSON.parse(JSON.stringify(config.data)),
    setData(patch) {
      for (const [key, value] of Object.entries(patch)) {
        if (key.includes('.')) setByPath(this.data, key, value)
        else this.data[key] = value
      }
    },
  }
}

async function main() {
  loadWechatModule(path.resolve(__dirname, '../pages/settings/index.js'))
  assert.equal(typeof pageConfig.onKindChange, 'function')
  assert.equal(typeof pageConfig.importDiscoveredModels, 'function')

  const page = createPageInstance(pageConfig)
  page.openModelSettings()
  assert.equal(page.data.formOpen, true)
  assert.equal(page.data.currentKindLabel, '大语言模型')
  assert.equal(page.data.draft.apiProtocol, 'multimodal-chat')
  assert.equal(page.data.draft.apiPath, 'v1/chat/completions')

  page.onKindChange({ detail: { value: 1 } })
  assert.equal(page.data.currentKindLabel, '生图模型')
  assert.equal(page.data.draft.kind, 'image')
  assert.equal(page.data.draft.apiProtocol, 'openai-images')
  assert.equal(page.data.draft.apiPath, 'v1/images/generations')

  page.setData({
    'draft.endpoint': 'https://third.example/',
    'draft.apiKey': 'sk-test',
  })
  await page.importDiscoveredModels([
    { id: 'img-a', name: 'img-a', kind: 'image' },
    { id: 'video-a', name: 'video-a', kind: 'video' },
    { id: 'chat-a', name: 'chat-a', kind: 'text' },
  ])
  assert.equal(savedProfiles.length, 1)
  assert.equal(savedProfiles[0].model, 'img-a')
  assert.equal(savedProfiles[0].kind, 'image')
  assert.equal(savedProfiles[0].apiProtocol, 'openai-images')
  assert.equal(savedProfiles[0].apiPath, 'v1/images/generations')
  assert.equal(savedProfiles[0].endpoint, 'https://third.example')

  page.onKindChange({ detail: { value: 0 } })
  assert.equal(page.data.currentKindLabel, '大语言模型')
  assert.equal(page.data.draft.kind, 'text')
  assert.equal(page.data.draft.apiProtocol, 'multimodal-chat')
  assert.equal(page.data.draft.apiPath, 'v1/chat/completions')

  page.onKindChange({ detail: { value: 2 } })
  assert.equal(page.data.currentKindLabel, '视频模型')
  assert.equal(page.data.draft.kind, 'video')
  assert.equal(page.data.draft.apiProtocol, 'openai-video')
  assert.equal(page.data.draft.apiPath, 'v1/video/generations')

  console.log('Settings third-party API smoke verified.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
