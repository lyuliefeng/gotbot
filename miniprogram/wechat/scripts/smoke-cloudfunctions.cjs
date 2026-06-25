const assert = require('node:assert/strict')
const http = require('node:http')
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

function startModelListServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/v1/models') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ data: [{ id: 'mock-image-model', name: 'Mock Image Model' }] }))
      return
    }
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve({ server, endpoint: `http://127.0.0.1:${address.port}` })
    })
  })
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
      endpoint: 'https://apihub.agnes-ai.com/v1',
      apiPath: 'images/generations',
      apiProtocol: 'agnes-image',
      model: 'agnes-image-2.1-flash',
      kind: 'image',
      keyMode: 'platform',
      isPrimary: true,
      status: 'untested',
    },
  })
  assert.equal(savedModel.id, 'smoke-model')
  assert.equal(savedModel.apiKey, '')
  assert.equal(savedModel.api_type, 'openai')
  assert.equal(savedModel.base_url, 'https://apihub.agnes-ai.com/v1')
  assert.equal(savedModel.enabled, true)

  const models = await invoke('modelProfiles', { action: 'list' })
  assert.ok(models.some((model) => model.id === 'smoke-model'))

  let core = await invoke('modelProfiles', { action: 'core' })
  assert.ok(core.channels.some((channel) => channel.id === 'channel-smoke-model'))
  assert.ok(core.apiEntries.some((entry) => entry.channel_id === 'channel-smoke-model' && entry.model === 'agnes-image-2.1-flash'))

  const savedChannel = await invoke('modelProfiles', {
    action: 'save',
    profile: {
      id: 'smoke-channel',
      name: 'Smoke Channel',
      api_type: 'custom',
      base_url: 'https://example.com/v1',
      apiKey: 'mock-key',
      keyMode: 'user',
      kind: 'image',
      enabled: false,
      notes: 'channel notes',
      upstream_headers: '{"X-Test":"1"}',
      available_models: [{ id: 'entry-a', name: 'Entry A' }, { id: 'entry-b', name: 'Entry B' }],
      selected_models: ['entry-b'],
    },
  })
  assert.equal(savedChannel.api_type, 'custom')
  assert.equal(savedChannel.base_url, 'https://example.com/v1')
  assert.equal(savedChannel.kind, 'image')
  assert.equal(savedChannel.enabled, false)
  core = await invoke('modelProfiles', { action: 'core' })
  const coreChannel = core.channels.find((channel) => channel.id === 'channel-smoke-channel')
  assert.equal(coreChannel.enabled, false)
  assert.equal(coreChannel.notes, 'channel notes')
  assert.equal(coreChannel.upstream_headers, '{"X-Test":"1"}')
  assert.ok(core.apiEntries.some((entry) => entry.channel_id === 'channel-smoke-channel' && entry.model === 'entry-b'))
  assert.ok(!core.apiEntries.some((entry) => entry.channel_id === 'channel-smoke-channel' && entry.model === 'entry-a'))
  await invoke('modelProfiles', { action: 'delete', id: 'smoke-channel' })

  const testResult = await invoke('modelProfiles', { action: 'test', profile: savedModel })
  assert.equal(typeof testResult.message, 'string')
  assert.equal(typeof testResult.latencyMs, 'number')
  assert.ok(['green', 'yellow', 'red'].includes(testResult.latencyLevel))

  const { server, endpoint } = await startModelListServer()
  try {
    const discovered = await invoke('modelProfiles', {
      action: 'discover',
      profile: {
        ...savedModel,
        base_url: endpoint,
        endpoint,
        keyMode: 'platform',
      },
    })
    assert.equal(discovered.sourceType, 'api-switch-discovery')
    assert.equal(discovered.availableModels[0].id, 'mock-image-model')
    assert.deepEqual(discovered.selectedModels, ['mock-image-model'])
    core = await invoke('modelProfiles', { action: 'core' })
    assert.ok(core.channels.some((channel) => channel.id === 'channel-smoke-model' && channel.base_url === endpoint))
    assert.ok(core.apiEntries.some((entry) => entry.channel_id === 'channel-smoke-model' && entry.model === 'mock-image-model'))
    assert.ok(!core.apiEntries.some((entry) => entry.channel_id === 'channel-smoke-model' && entry.model === 'agnes-image-2.1-flash'))
  } finally {
    server.close()
  }

  const deleted = await invoke('modelProfiles', { action: 'delete', id: 'smoke-model' })
  assert.equal(deleted, true)
  core = await invoke('modelProfiles', { action: 'core' })
  assert.ok(!core.channels.some((channel) => channel.id === 'channel-smoke-model'))
  assert.ok(!core.apiEntries.some((entry) => entry.channel_id === 'channel-smoke-model'))

  await invoke('modelProfiles', {
    action: 'save',
    profile: savedModel,
  })

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

  console.log('Cloud function smoke test passed.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
