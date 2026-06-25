const { decryptText, encryptText } = require('./common/crypto')
const { list, remove, upsert } = require('./common/db')
const { testProfile } = require('./common/generation-service')
const { fail, ok } = require('./common/types')
const http = require('node:http')
const https = require('node:https')

function sanitizeProfile(profile) {
  const { encryptedApiKey, encryptedApiSecret, apiKey, apiSecret, ...rest } = profile
  return { ...rest, apiKey: '', apiSecret: '' }
}

function toApiSwitchType(profile) {
  if (profile.apiProtocol === 'agnes-image') return 'openai'
  if (profile.apiProtocol === 'multimodal-chat') return 'openai'
  if (profile.apiProtocol === 'openai-image-edits') return 'openai'
  if (profile.apiProtocol === 'openai-images') return 'openai'
  if (profile.apiProtocol === 'dashscope-wanxiang') return 'custom'
  if (profile.apiProtocol === 'mgtv-storyboard') return 'custom'
  return 'custom'
}

function buildApiSwitchCore(profile, openid) {
  const now = new Date().toISOString()
  const availableModels = Array.isArray(profile.availableModels) && profile.availableModels.length
    ? profile.availableModels
    : [{ id: profile.model, name: profile.model, kind: profile.kind || 'image', source: profile.endpoint }].filter((item) => item.id)
  const selectedModels = Array.isArray(profile.selectedModels) && profile.selectedModels.length
    ? profile.selectedModels
    : availableModels.map((model) => model.id || model.name).filter(Boolean)
  const selectedSet = new Set(selectedModels)
  const channelId = `channel-${profile.id}`
  const channel = {
    id: channelId,
    openid,
    name: profile.name,
    api_type: toApiSwitchType(profile),
    base_url: profile.endpoint,
    api_path: profile.apiPath || '',
    api_protocol: profile.apiProtocol || '',
    key_mode: profile.keyMode,
    enabled: true,
    available_models: availableModels,
    selected_models: selectedModels,
    latency_ms: profile.latencyMs || null,
    latency_level: profile.latencyLevel || '',
    last_fetch_at: profile.lastFetchedAt || null,
    updated_at: now,
  }
  const apiEntries = availableModels.filter((model) => selectedSet.has(model.id) || selectedSet.has(model.name)).map((model, index) => ({
    id: `entry-${profile.id}-${model.id || model.name}`,
    openid,
    channel_id: channelId,
    model: model.id || model.name,
    display_name: model.name || model.id,
    group_name: 'auto',
    enabled: true,
    sort_index: index,
    kind: model.kind || profile.kind || 'image',
    source: model.source || profile.endpoint,
    response_ms: profile.latencyMs || null,
    updated_at: now,
  }))
  return { channel, apiEntries }
}

async function syncApiSwitchCore(profile, openid) {
  const core = buildApiSwitchCore(profile, openid)
  await upsert('apiSwitchChannels', (item) => item.id === core.channel.id && item.openid === openid, core.channel)
  await remove('apiSwitchEntries', (item) => item.channel_id === core.channel.id && item.openid === openid)
  await Promise.all(core.apiEntries.map((entry) => upsert('apiSwitchEntries', (item) => item.id === entry.id && item.openid === openid, entry)))
  return core
}

async function removeApiSwitchCore(profileId, openid) {
  const channelId = `channel-${profileId}`
  await remove('apiSwitchEntries', (item) => item.channel_id === channelId && item.openid === openid)
  await remove('apiSwitchChannels', (item) => item.id === channelId && item.openid === openid)
}

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const transport = target.protocol === 'http:' ? http : https
    const req = transport.request(target, options, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        let data = null
        try {
          data = body ? JSON.parse(body) : null
        } catch {
          data = null
        }
        resolve({ statusCode: res.statusCode || 0, headers: res.headers, body, data })
      })
    })
    req.setTimeout(10000, () => req.destroy(new Error('request timeout')))
    req.on('error', reject)
    req.end()
  })
}

function buildDiscoveryUrls(baseUrl) {
  const root = String(baseUrl || '').replace(/\/+$/, '')
  const urls = []
  const push = (value) => {
    if (value && !urls.includes(value)) urls.push(value)
  }
  push(`${root}/v1/models`)
  push(`${root}/models`)
  push(`${root}/api/models`)
  push(`${root}/v1beta/openai/models`)
  return urls
}

function classifyLatency(latencyMs) {
  if (latencyMs < 200) return 'green'
  if (latencyMs <= 500) return 'yellow'
  return 'red'
}

function buildHeaders(profile) {
  const headers = { Accept: 'application/json' }
  const token = profile.apiKey || ''
  const endpoint = String(profile.endpoint || '')
  if (!token) return headers
  if (endpoint.includes('generativelanguage.googleapis.com')) return headers
  headers.Authorization = `Bearer ${token}`
  return headers
}

function normalizeDiscoveredModels(data, endpointUrl) {
  const items = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data?.models)
      ? data.models
      : Array.isArray(data)
        ? data
        : []

  return items.map((item) => {
    const rawName = item.id || item.name || item.model || item.display_name || ''
    const normalizedName = String(rawName).replace(/^models\//, '')
    return {
      id: normalizedName,
      name: item.name || normalizedName,
      kind: /image|flux|sdxl|wanx|vision|paint|draw/i.test(normalizedName) ? 'image' : 'text',
      source: endpointUrl,
    }
  }).filter((item) => item.id)
}

async function discoverModels(profile) {
  const hydrated = {
    ...profile,
    apiKey: profile.keyMode === 'user' ? profile.apiKey || decryptText(profile.encryptedApiKey || '') : process.env.PLATFORM_IMAGE_API_KEY || '',
    apiSecret: profile.keyMode === 'user' ? profile.apiSecret || decryptText(profile.encryptedApiSecret || '') : process.env.PLATFORM_IMAGE_API_SECRET || '',
  }

  if (!hydrated.endpoint?.trim()) throw new Error('请填写 Base URL')
  if (hydrated.keyMode === 'user' && !hydrated.apiKey?.trim()) throw new Error('请填写 API Key')

  const candidates = buildDiscoveryUrls(hydrated.endpoint)
  const errors = []
  for (const url of candidates) {
    const startedAt = Date.now()
    try {
      const result = await requestJson(url, { method: 'GET', headers: buildHeaders(hydrated) })
      const latencyMs = Date.now() - startedAt
      if (result.statusCode >= 200 && result.statusCode < 300) {
        const availableModels = normalizeDiscoveredModels(result.data, url)
        if (availableModels.length) {
          return {
            availableModels,
            selectedModels: availableModels.map((model) => model.id),
            sourceType: 'api-switch-discovery',
            lastFetchedAt: new Date().toISOString(),
            latencyMs,
            latencyLevel: classifyLatency(latencyMs),
            status: 'connected',
            discoveredFrom: url,
          }
        }
        errors.push(`${url}: empty model list`)
        continue
      }
      errors.push(`${url}: ${result.statusCode}`)
    } catch (error) {
      errors.push(`${url}: ${error.message || 'request failed'}`)
    }
  }

  throw new Error(`模型识别失败：${errors.join(' | ')}`)
}

exports.main = async function main(event = {}, context = {}) {
  try {
    const openid = context.OPENID || event.openid || 'mock-openid'
    if (event.action === 'list') {
      const profiles = await list('modelProfiles', (item) => item.openid === openid)
      return ok(profiles.map(sanitizeProfile))
    }

    if (event.action === 'save') {
      const profile = event.profile || {}
      const id = profile.id || `model-${Date.now()}`
      const saved = await upsert('modelProfiles', (item) => item.id === id && item.openid === openid, {
        ...profile,
        id,
        openid,
        encryptedApiKey: profile.keyMode === 'user' ? encryptText(profile.apiKey || '') : '',
        encryptedApiSecret: profile.keyMode === 'user' ? encryptText(profile.apiSecret || '') : '',
        apiKey: undefined,
        apiSecret: undefined,
        updatedAt: new Date().toISOString(),
      })
      await syncApiSwitchCore({ ...profile, id }, openid)
      return ok(sanitizeProfile(saved))
    }

    if (event.action === 'discover') {
      const profile = event.profile || {}
      const id = profile.id || `model-${Date.now()}`
      const discovery = await discoverModels(profile)
      const saved = await upsert('modelProfiles', (item) => item.id === id && item.openid === openid, {
        ...profile,
        ...discovery,
        id,
        openid,
        encryptedApiKey: profile.keyMode === 'user' ? encryptText(profile.apiKey || '') : '',
        encryptedApiSecret: profile.keyMode === 'user' ? encryptText(profile.apiSecret || '') : '',
        apiKey: undefined,
        apiSecret: undefined,
        updatedAt: new Date().toISOString(),
      })
      await syncApiSwitchCore({ ...profile, ...discovery, id }, openid)
      return ok(sanitizeProfile(saved))
    }

    if (event.action === 'core') {
      const channels = await list('apiSwitchChannels', (item) => item.openid === openid)
      const entries = await list('apiSwitchEntries', (item) => item.openid === openid)
      return ok({ channels, apiEntries: entries })
    }

    if (event.action === 'delete') {
      const removed = await remove('modelProfiles', (item) => item.id === event.id && item.openid === openid)
      await removeApiSwitchCore(event.id, openid)
      return ok(removed)
    }

    if (event.action === 'test') {
      const profile = event.profile || {}
      const hydrated = {
        ...profile,
        apiKey: profile.keyMode === 'user' ? profile.apiKey || decryptText(profile.encryptedApiKey || '') : process.env.PLATFORM_IMAGE_API_KEY || '',
        apiSecret: profile.keyMode === 'user' ? profile.apiSecret || decryptText(profile.encryptedApiSecret || '') : process.env.PLATFORM_IMAGE_API_SECRET || '',
      }
      const discoveryUrls = buildDiscoveryUrls(hydrated.endpoint)
      const startedAt = Date.now()
      const response = await requestJson(discoveryUrls[0], { method: 'GET', headers: buildHeaders(hydrated) }).catch(() => null)
      if (response && response.statusCode >= 200 && response.statusCode < 500) {
        const latencyMs = Date.now() - startedAt
        return ok({
          ok: response.statusCode < 400,
          message: `${profile.name} 连通，延迟 ${latencyMs}ms`,
          latencyMs,
          latencyLevel: classifyLatency(latencyMs),
          endpoint: discoveryUrls[0],
        })
      }
      return ok(await testProfile(hydrated))
    }

    return fail('unsupported action')
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'modelProfiles failed')
  }
}
