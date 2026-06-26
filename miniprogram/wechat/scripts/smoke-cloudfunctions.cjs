const assert = require('node:assert/strict')
const path = require('node:path')

const cloudRoot = path.resolve(__dirname, '../../cloudfunctions')
const context = { OPENID: 'smoke-openid' }

async function invoke(name, event) {
  const mod = require(path.join(cloudRoot, name, 'index.js'))
  assert.equal(typeof mod.main, 'function', `${name} must export main`)
  const result = await mod.main(event, context)
  assert.equal(result.ok, true, `${name} failed: ${result.error || 'unknown error'}`)
  return result.data
}

async function main() {
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

  const testResult = await invoke('modelProfiles', { action: 'test', profile: savedModel })
  assert.equal(typeof testResult.message, 'string')

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
