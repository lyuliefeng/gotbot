const { decryptText } = require('./common/crypto')
const { list, remove, upsert } = require('./common/db')
const { createGenerationTask, MAX_BATCH_SIZE } = require('./common/generation-service')
const { pickPlatformImageKey } = require('./common/platform-keys')
const { fail, ok } = require('./common/types')

function resolveOpenid(context, event) {
  const openid = context.OPENID
  if (!openid) throw new Error('认证失败：无法获取用户身份')
  return openid
}

function hydrateProfile(profile) {
  return {
    ...profile,
    apiKey: profile.keyMode === 'platform' ? pickPlatformImageKey() : decryptText(profile.encryptedApiKey || ''),
  }
}

const TASK_WHITELIST = [
  'prompt', 'negativePrompt', 'mode', 'width', 'height', 'modelId', 'batchSize',
  'referenceImage', 'videoDuration', 'videoFrameRate', 'videoFrames',
]

function whitelistInput(input) {
  const out = {}
  for (const key of TASK_WHITELIST) {
    if (input[key] !== undefined) out[key] = input[key]
  }
  return out
}

exports.main = async function main(event = {}, context = {}) {
  try {
    const openid = resolveOpenid(context, event)

    if (event.action === 'list') {
      return ok(await list('generationTasks', (item) => item.openid === openid))
    }

    if (event.action === 'create') {
      if (!event.input || typeof event.input !== 'object') throw new Error('缺少生成参数')
      if (typeof event.input.batchSize === 'number' && event.input.batchSize > MAX_BATCH_SIZE) {
        throw new Error(`batchSize 不能超过 ${MAX_BATCH_SIZE}`)
      }
      const profiles = await list('modelProfiles', (item) => item.openid === openid)
      const model = hydrateProfile(profiles.find((item) => item.id === event.input.modelId) || {
        id: 'platform-agnes-image',
        name: '平台 Agnes Image',
        endpoint: 'https://apihub.agnes-ai.com',
        apiPath: 'v1/images/generations',
        apiProtocol: 'openai-images',
        model: 'agnes-image-2.1-flash',
        keyMode: 'platform',
      })
      const task = await createGenerationTask(event.input, model, openid)
      await upsert('generationTasks', (item) => item.id === task.id, { ...whitelistInput(task), id: task.id, openid, status: task.status, assetKind: task.assetKind, assets: task.assets, createdAt: task.createdAt, keyMode: task.keyMode })
      return ok(task)
    }

    if (event.action === 'deleteTask') {
      if (!event.id) throw new Error('缺少任务 ID')
      const removed = await remove('generationTasks', (item) => item.id === event.id && item.openid === openid)
      if (!removed) throw new Error('任务不存在或无权删除')
      return ok(true)
    }

    if (event.action === 'toggleFavoriteAsset') {
      if (!event.taskId || !event.assetId) throw new Error('缺少任务 ID 或资产 ID')
      const tasks = await list('generationTasks', (item) => item.id === event.taskId && item.openid === openid)
      const task = tasks[0]
      if (!task) throw new Error('任务不存在')
      task.assets = task.assets.map((asset) => asset.id === event.assetId ? { ...asset, isFavorite: !asset.isFavorite } : asset)
      await upsert('generationTasks', (item) => item.id === task.id, task)
      return ok(true)
    }

    throw new Error('不支持的操作')
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'generationTasks failed')
  }
}
