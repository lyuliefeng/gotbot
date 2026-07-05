const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const storage = new Map()

global.wx = {
  getStorageSync(key) {
    return storage.get(key)
  },
  setStorageSync(key, value) {
    storage.set(key, value)
  },
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
  const wrapped = `(function(require, module, exports, wx) {\n${source}\n})`
  vm.runInNewContext(wrapped, { wx, console })(localRequire, module, module.exports, wx)
  return module.exports
}

const {
  applyDefaultModelIds,
  loadState,
  mergeModelsById,
  mergePromptsByContent,
  modelsForKind,
  preferredModelForKind,
  saveState,
  visibleModels,
} = loadWechatModule(path.resolve(__dirname, '../utils/state.js'))

const models = [
  { id: 'platform-image', model: '平台图片', kind: 'image', keyMode: 'platform', latencyMs: 1 },
  { id: 'user-image-slow', model: 'user-image-slow', kind: 'image', keyMode: 'user', latencyMs: 120 },
  { id: 'user-image-fast', model: 'user-image-fast', kind: 'image', keyMode: 'user', latencyMs: 30 },
  { id: 'user-text', model: 'user-text', kind: 'text', keyMode: 'user', latencyMs: 40 },
  { id: 'user-video', model: 'user-video', kind: 'video', keyMode: 'user', latencyMs: 20 },
  { id: 'hidden-video', model: '', kind: 'video', keyMode: 'user', latencyMs: 10 },
]

assert.equal(visibleModels(models).length, 4)
assert.deepEqual(modelsForKind(models, 'image').map((model) => model.id), ['user-image-slow', 'user-image-fast'])
assert.deepEqual(modelsForKind(models, 'image', { includePlatform: true }).map((model) => model.id), ['user-image-slow', 'user-image-fast'])
assert.equal(preferredModelForKind(models, 'image')?.id, 'user-image-fast')
assert.equal(preferredModelForKind(models, 'image', { includePlatform: false })?.id, 'user-image-fast')
assert.equal(preferredModelForKind(models, 'video')?.id, 'user-video')

const state = { models, prompts: [], tasks: [] }
applyDefaultModelIds(state)
assert.equal(state.defaultModelId, 'user-image-fast')
assert.equal(state.defaultTextModelId, 'user-text')
assert.equal(state.defaultVideoModelId, 'user-video')

const merged = mergeModelsById([{ id: 'a', model: 'old' }], [{ id: 'a', model: 'new' }, { id: 'b', model: 'new-b' }])
assert.equal(JSON.stringify(merged.map((model) => `${model.id}:${model.model}`)), JSON.stringify(['a:new', 'b:new-b']))

const mergedPrompts = mergePromptsByContent(
  [{ id: 'prompt-a', prompt: '内置提示词' }],
  [{ id: 'prompt-a', prompt: '重复提示词' }, { id: 'custom-prompt', prompt: '用户自定义场景' }],
)
assert.equal(JSON.stringify(mergedPrompts.map((prompt) => prompt.id)), JSON.stringify(['prompt-a', 'custom-prompt']))

saveState({ models: [], prompts: [{ id: 'custom-prompt', prompt: '用户自定义场景' }], tasks: 'bad' })
const normalized = loadState()
assert.ok(Array.isArray(normalized.models) && normalized.models.length === 0)
assert.ok(Array.isArray(normalized.prompts) && normalized.prompts.length >= 18)
assert.ok(normalized.prompts.some((prompt) => prompt.id === 'prompt-18'))
assert.ok(normalized.prompts.some((prompt) => prompt.id === 'custom-prompt'))
assert.equal(JSON.stringify(normalized.tasks), JSON.stringify([]))

saveState({ models: [{ id: 'legacy-user-image', model: 'legacy-user-image', kind: 'image', keyMode: 'user' }], prompts: [], tasks: [] })
const normalizedLegacy = loadState()
assert.ok(!normalizedLegacy.models.some((model) => model.keyMode === 'platform'))
assert.ok(normalizedLegacy.models.some((model) => model.id === 'legacy-user-image'))

console.log('Model state smoke verified.')
