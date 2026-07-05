const { defaultModels, prompts } = require('./catalog')

const KEY = 'gotbot-miniprogram-state'
const builtinDefaultModelIds = new Set([
  'platform-agnes-image',
  'platform-gogoing-text',
  'platform-gogoing-image',
  'platform-agnes-video',
  'openai-gpt-image-2',
])

function isBuiltinDefaultModel(model) {
  return Boolean(model && (model.keyMode === 'platform' || builtinDefaultModelIds.has(model.id)))
}

function initialState() {
  return {
    models: defaultModels,
    prompts,
    tasks: [],
    defaultTextModelId: defaultModels.find((model) => model.kind === 'text')?.id || '',
    defaultModelId: defaultModels.find((model) => model.kind === 'image')?.id || '',
    defaultVideoModelId: defaultModels.find((model) => model.kind === 'video')?.id || '',
  }
}

function visibleModels(models) {
  return (models || []).filter((model) => Boolean(model && model.model && !isBuiltinDefaultModel(model)))
}

function modelsForKind(models, kind, options = {}) {
  const includePlatform = Boolean(options.includePlatform)
  return visibleModels(models).filter((model) => (model.kind || 'image') === kind && (includePlatform || model.keyMode !== 'platform'))
}

function preferredModelForKind(models, kind, options = {}) {
  const scoped = modelsForKind(models, kind, { includePlatform: options.includePlatform !== false })
  return scoped.slice().sort((left, right) => {
    const leftLatency = typeof left.latencyMs === 'number' ? left.latencyMs : Number.MAX_SAFE_INTEGER
    const rightLatency = typeof right.latencyMs === 'number' ? right.latencyMs : Number.MAX_SAFE_INTEGER
    return leftLatency - rightLatency
  })[0] || null
}

function applyDefaultModelIds(state, models = state.models || []) {
  const textDefault = preferredModelForKind(models, 'text')
  const imageDefault = preferredModelForKind(models, 'image')
  const videoDefault = preferredModelForKind(models, 'video')
  state.defaultTextModelId = textDefault ? textDefault.id : ''
  state.defaultModelId = imageDefault ? imageDefault.id : ''
  state.defaultVideoModelId = videoDefault ? videoDefault.id : ''
  return state
}

function mergeModelsById(existing, incoming) {
  const map = new Map((existing || []).map((model) => [model.id, model]))
  for (const model of incoming || []) map.set(model.id, model)
  return Array.from(map.values())
}

function mergePromptsByContent(existing, incoming) {
  const seen = new Set()
  const merged = []
  for (const prompt of (existing || []).concat(incoming || [])) {
    const key = prompt.id || prompt.prompt
    if (!key || seen.has(key)) continue
    seen.add(key)
    merged.push(prompt)
  }
  return merged
}

function normalizeState(saved) {
  const state = saved && typeof saved === 'object' ? { ...initialState(), ...saved } : initialState()
  if (!Array.isArray(state.models) || !state.models.length) state.models = defaultModels
  else state.models = mergeModelsById(defaultModels, state.models)
  state.models = (state.models || []).filter((model) => !isBuiltinDefaultModel(model))
  state.prompts = Array.isArray(state.prompts) && state.prompts.length ? mergePromptsByContent(prompts, state.prompts) : prompts
  if (!Array.isArray(state.tasks)) state.tasks = []
  if (!state.defaultTextModelId || !state.defaultModelId || !state.defaultVideoModelId) applyDefaultModelIds(state)
  return state
}

function loadState() {
  return normalizeState(wx.getStorageSync(KEY))
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

module.exports = {
  applyDefaultModelIds,
  loadState,
  mergeModelsById,
  mergePromptsByContent,
  modelsForKind,
  preferredModelForKind,
  saveState,
  updateState,
  visibleModels,
}
