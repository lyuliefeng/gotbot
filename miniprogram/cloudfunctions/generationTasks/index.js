const { decryptText } = require('./common/crypto')
const { list, remove, upsert } = require('./common/db')
const { createGenerationTask } = require('./common/generation-service')
const { fail, ok } = require('./common/types')

function hydrateProfile(profile) {
  return {
    ...profile,
    apiKey: profile.keyMode === 'platform' ? process.env.PLATFORM_IMAGE_API_KEY || '' : decryptText(profile.encryptedApiKey || ''),
    apiSecret: profile.keyMode === 'platform' ? process.env.PLATFORM_IMAGE_API_SECRET || '' : decryptText(profile.encryptedApiSecret || ''),
  }
}

function resolveModelProfile(profiles, modelId) {
  const enabledProfiles = profiles.filter((item) => item.enabled !== false)
  const direct = enabledProfiles.find((item) => item.id === modelId)
  if (direct) return direct
  for (const profile of enabledProfiles) {
    const available = Array.isArray(profile.availableModels)
      ? profile.availableModels
      : Array.isArray(profile.available_models)
        ? profile.available_models
        : []
    const selected = Array.isArray(profile.selectedModels) && profile.selectedModels.length
      ? profile.selectedModels
      : Array.isArray(profile.selected_models) && profile.selected_models.length
        ? profile.selected_models
        : available.map((model) => model.id || model.name).filter(Boolean)
    const selectedSet = new Set(selected)
    const matched = available.find((model) => `${profile.id}-${model.id || model.name}` === modelId || model.id === modelId)
    if (matched && (selectedSet.has(matched.id) || selectedSet.has(matched.name))) {
      return {
        ...profile,
        id: modelId,
        parentModelProfileId: profile.id,
        name: matched.name || matched.id,
        model: matched.id || matched.name,
      }
    }
  }
  return null
}

exports.main = async function main(event = {}, context = {}) {
  try {
    const openid = context.OPENID || event.openid || 'mock-openid'

    if (event.action === 'list') {
      return ok(await list('generationTasks', (item) => item.openid === openid))
    }

    if (event.action === 'create') {
      const profiles = await list('modelProfiles', (item) => item.openid === openid)
      const model = hydrateProfile(resolveModelProfile(profiles, event.input.modelId) || {
        id: 'platform-agnes-image',
        name: '平台 Agnes Image',
        endpoint: 'https://apihub.agnes-ai.com/v1',
        apiPath: 'images/generations',
        apiProtocol: 'agnes-image',
        model: 'agnes-image-2.1-flash',
        keyMode: 'platform',
      })
      const task = await createGenerationTask(event.input, model, openid)
      await upsert('generationTasks', (item) => item.id === task.id, { ...task, openid })
      return ok(task)
    }

    if (event.action === 'deleteTask') {
      return ok(await remove('generationTasks', (item) => item.id === event.id && item.openid === openid))
    }

    if (event.action === 'toggleFavoriteAsset') {
      const tasks = await list('generationTasks', (item) => item.id === event.taskId && item.openid === openid)
      const task = tasks[0]
      if (!task) return fail('task not found')
      task.assets = task.assets.map((asset) => asset.id === event.assetId ? { ...asset, isFavorite: !asset.isFavorite } : asset)
      await upsert('generationTasks', (item) => item.id === task.id, task)
      return ok(true)
    }

    return fail('unsupported action')
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'generationTasks failed')
  }
}
