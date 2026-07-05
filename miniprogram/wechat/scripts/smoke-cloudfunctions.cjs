const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { spawnSync } = require('node:child_process')

const cloudRoot = path.resolve(__dirname, '../../cloudfunctions')
const context = { OPENID: 'smoke-openid' }

process.env.GOTBOT_MINIPROGRAM_SECRET = process.env.GOTBOT_MINIPROGRAM_SECRET || 'gotbot-smoke-secret'

async function invoke(name, event) {
  const mod = require(path.join(cloudRoot, name, 'index.js'))
  assert.equal(typeof mod.main, 'function', `${name} must export main`)
  const result = await mod.main(event, context)
  assert.equal(result.ok, true, `${name} failed: ${result.error || 'unknown error'}`)
  return result.data
}

async function main() {
  const bundleOut = fs.mkdtempSync(path.join(os.tmpdir(), 'gotbot-cloud-bundle-smoke-'))
  const bundleResult = spawnSync(process.execPath, [path.join(__dirname, 'build-cloudfunction-bundles.cjs'), bundleOut], { encoding: 'utf8' })
  assert.equal(bundleResult.status, 0, bundleResult.stderr || bundleResult.stdout)
  assert.ok(fs.existsSync(path.join(bundleOut, 'promptPolish', 'index.js')), 'promptPolish must be included in cloud function bundles')
  assert.ok(fs.existsSync(path.join(bundleOut, 'realtimeScan', 'index.js')), 'realtimeScan must be included in cloud function bundles')

  const login = await invoke('login', { action: 'bootstrap' })
  assert.equal(login.openid, context.OPENID)

  const savedModel = await invoke('modelProfiles', {
    action: 'save',
    profile: {
      id: 'smoke-model',
      name: 'Smoke Agnes Model',
      provider: 'openai-compatible',
      endpoint: 'https://apihub.agnes-ai.com',
      apiPath: 'v1/images/generations',
      apiProtocol: 'openai-images',
      model: 'agnes-image-2.1-flash',
      kind: 'image',
      keyMode: 'platform',
      isPrimary: true,
      status: 'untested',
    },
  })
  assert.equal(savedModel.id, 'smoke-model')
  assert.equal(savedModel.apiKey, '')

  const models = await invoke('modelProfiles', { action: 'list' })
  assert.ok(models.some((model) => model.id === 'smoke-model'))

  const importedModels = await invoke('modelProfiles', {
    action: 'saveMany',
    profiles: [
      { name: 'Smoke Text Model', endpoint: 'https://apihub.agnes-ai.com', apiPath: 'v1/chat/completions', apiProtocol: 'multimodal-chat', model: 'agnes-2.0-flash', kind: 'text', keyMode: 'user', apiKey: 'smoke-user-key', latencyMs: 12 },
      { name: 'Smoke Image Model', endpoint: 'https://apihub.agnes-ai.com', apiPath: 'v1/images/generations', apiProtocol: 'openai-images', model: 'agnes-image-2.1-flash', kind: 'image', keyMode: 'user', apiKey: 'smoke-user-key', latencyMs: 12 },
    ],
  })
  assert.deepEqual(importedModels.map((model) => model.kind).sort(), ['image', 'text'])
  assert.ok(importedModels.every((model) => model.apiKey === ''), 'imported models must not expose API keys')

  const testResult = await invoke('modelProfiles', { action: 'test', profile: savedModel })
  assert.equal(typeof testResult.message, 'string')

  const realtimeSession = await invoke('realtimeScan', {
    action: 'startSession',
    grade: '初一',
    subject: '数学',
    textbookId: '人教版',
  })
  assert.match(realtimeSession.sessionId, /^session-/)
  const realtimeFrame = await invoke('realtimeScan', {
    action: 'pushFrame',
    sessionId: realtimeSession.sessionId,
    cloudFileId: 'cloud://smoke-frame.jpg',
    frameHash: 'smoke-frame',
    timestamp: Date.now(),
    ocrText: '已知一次函数 y=2x+1，求 x=3 时 y 的值。',
  })
  assert.equal(realtimeFrame.status, 'recognized')
  assert.ok(realtimeFrame.detectedQuestion.includes('一次函数'))
  const realtimeAnswer = await invoke('realtimeScan', {
    action: 'ask',
    sessionId: realtimeSession.sessionId,
    questionText: '怎么做',
    mode: 'explain',
  })
  assert.ok(realtimeAnswer.answer.includes('一次函数'))
  const mistake = await invoke('realtimeScan', {
    action: 'saveMistake',
    sessionId: realtimeSession.sessionId,
    answerId: realtimeAnswer.answerId,
    studentAnswer: 'y=7',
  })
  assert.match(mistake.recordId, /^mistake-/)
  const ended = await invoke('realtimeScan', { action: 'endSession', sessionId: realtimeSession.sessionId })
  assert.equal(ended.sessionId, realtimeSession.sessionId)

  if (!process.env.PLATFORM_TEXT_API_KEY && !process.env.PLATFORM_IMAGE_API_KEY) {
    const polishMod = require(path.join(cloudRoot, 'promptPolish', 'index.js'))
    const missingPolishKey = await polishMod.main({ action: 'polish', type: 'prompt', text: 'smoke test prompt' }, context)
    assert.equal(missingPolishKey.ok, false)
    assert.match(missingPolishKey.error, /API Key/)
  }

  if (!process.env.PLATFORM_IMAGE_API_KEY) {
    const generationMod = require(path.join(cloudRoot, 'generationTasks', 'index.js'))
    const missingKeyResult = await generationMod.main({
      action: 'create',
      input: {
        mode: 'txt2img',
        prompt: 'smoke test poster',
        negativePrompt: '',
        modelId: 'smoke-model',
        width: 512,
        height: 512,
        batchSize: 1,
        steps: 20,
        seed: 1,
        style: '自然',
        modeOptions: { toolId: 'text-to-image' },
      },
    }, context)
    assert.equal(missingKeyResult.ok, false)
    assert.match(missingKeyResult.error, /API Key/)
    console.log('Cloud function smoke test passed without live Agnes key.')
    return
  }

  const generationMod = require(path.join(cloudRoot, 'generationTasks', 'index.js'))
  const missingReference = await generationMod.main({
    action: 'create',
    input: {
      mode: 'img2img',
      prompt: 'smoke image edit',
      negativePrompt: '',
      modelId: 'smoke-model',
      width: 512,
      height: 512,
      batchSize: 1,
      steps: 20,
      seed: 1,
      style: '自然',
      modeOptions: { toolId: 'image-to-image' },
    },
  }, context)
  assert.equal(missingReference.ok, false)
  assert.match(missingReference.error, /图生图需要先上传参考图/)

  const task = await invoke('generationTasks', {
    action: 'create',
    input: {
      mode: 'txt2img',
      prompt: 'smoke test poster',
      negativePrompt: '',
      modelId: 'smoke-model',
      width: 512,
      height: 512,
      batchSize: 1,
      steps: 20,
      seed: 1,
      style: '自然',
      modeOptions: { toolId: 'text-to-image' },
    },
  })
  assert.equal(task.status, 'completed')
  assert.equal(task.assets.length, 1)
  assert.ok(task.assets[0].dataUrl || task.assets[0].cloudFileId)

  const tasks = await invoke('generationTasks', { action: 'list' })
  assert.ok(tasks.some((item) => item.id === task.id))

  await invoke('generationTasks', { action: 'toggleFavoriteAsset', taskId: task.id, assetId: task.assets[0].id })
  const afterFavorite = await invoke('generationTasks', { action: 'list' })
  const favoriteTask = afterFavorite.find((item) => item.id === task.id)
  assert.equal(favoriteTask.assets[0].isFavorite, true)

  const prompts = await invoke('promptPacks', { action: 'sync', source: 'glidea' })
  assert.ok(prompts.length > 0)

  if (process.env.PLATFORM_TEXT_API_KEY || process.env.PLATFORM_IMAGE_API_KEY) {
    const polished = await invoke('promptPolish', { action: 'polish', type: 'prompt', text: 'modern creator workspace', toolTitle: '文生图' })
    assert.equal(typeof polished.text, 'string')
    assert.ok(polished.text.length > 0)
  }

  console.log('Cloud function smoke test passed.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
