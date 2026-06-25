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

function profileApiType(profile) {
  return profile.api_type || profile.apiType || toApiSwitchType(profile)
}

function profileBaseUrl(profile) {
  return profile.base_url || profile.baseUrl || profile.endpoint || ''
}

function profileAvailableModels(profile) {
  return profile.available_models || profile.availableModels || []
}

function profileSelectedModels(profile) {
  return profile.selected_models || profile.selectedModels || []
}

function normalizeProfile(profile) {
  const apiType = profileApiType(profile)
  const baseUrl = profileBaseUrl(profile)
  const availableModels = profileAvailableModels(profile)
  const selectedModels = profileSelectedModels(profile)
  const primaryModel = profile.model || selectedModels[0] || availableModels[0]?.id || availableModels[0]?.name || ''
  return {
    ...profile,
    api_type: apiType,
    apiType,
    base_url: baseUrl,
    baseUrl,
    endpoint: baseUrl,
    available_models: availableModels,
    availableModels,
    selected_models: selectedModels,
    selectedModels,
    response_ms: profile.response_ms || (Number.isFinite(profile.latencyMs) ? String(profile.latencyMs) : ''),
    enabled: profile.enabled !== false,
    apiProtocol: profile.apiProtocol || (apiType === 'responses' ? 'multimodal-chat' : 'agnes-image'),
    apiPath: profile.apiPath || (apiType === 'responses' ? 'responses' : 'images/generations'),
    kind: profile.kind || 'image',
    model: primaryModel,
  }
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
  const normalized = normalizeProfile(profile)
  const now = new Date().toISOString()
  const availableModels = Array.isArray(normalized.availableModels) && normalized.availableModels.length
    ? normalized.availableModels
    : [{ id: normalized.model, name: normalized.model, kind: normalized.kind || 'image', source: normalized.endpoint }].filter((item) => item.id)
  const selectedModels = Array.isArray(normalized.selectedModels) && normalized.selectedModels.length
    ? normalized.selectedModels
    : availableModels.map((model) => model.id || model.name).filter(Boolean)
  const selectedSet = new Set(selectedModels)
  const channelId = `channel-${normalized.id}`
  const channel = {
    id: channelId,
    openid,
    name: normalized.name,
    api_type: normalized.api_type,
    base_url: normalized.base_url,
    api_key: '',
    key_mode: normalized.keyMode,
    enabled: normalized.enabled,
    available_models: availableModels,
    selected_models: selectedModels,
    last_fetch_at: normalized.lastFetchedAt || normalized.last_fetch_at || null,
    notes: normalized.notes || '',
    upstream_headers: normalized.upstream_headers || normalized.upstreamHeaders || '',
    response_ms: normalized.response_ms || '',
    latency_ms: normalized.latencyMs || null,
    latency_level: normalized.latencyLevel || '',
    updated_at: now,
  }
  const apiEntries = availableModels.filter((model) => selectedSet.has(model.id) || selectedSet.has(model.name)).map((model, index) => ({
    id: `entry-${normalized.id}-${model.id || model.name}`,
    openid,
    channel_id: channelId,
    model: model.id || model.name,
    display_name: model.name || model.id,
    group_name: 'auto',
    enabled: true,
    sort_index: index,
    kind: model.kind || normalized.kind || 'image',
    source: model.source || normalized.endpoint,
    response_ms: normalized.response_ms || (normalized.latencyMs ? String(normalized.latencyMs) : null),
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

function buildApiTypeDiscoveryUrls(baseUrl, apiType) {
  const root = String(baseUrl || '').replace(/\/+$/, '')
  const urls = []
  const push = (value) => {
    if (value && !urls.includes(value)) urls.push(value)
  }
  if (apiType === 'gemini') {
    push(`${root}/v1beta/openai/models`)
    push(`${root}/v1beta/models`)
  } else if (apiType === 'claude') {
    push(`${root}/v1/models`)
    push(`${root}/anthropic/v1/models`)
  } else if (apiType === 'azure') {
    push(`${root}/openai/models`)
  } else {
    buildDiscoveryUrls(root).forEach(push)
  }
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
  const normalized = normalizeProfile(profile)
  const hydrated = {
    ...normalized,
    apiKey: normalized.keyMode === 'user' ? normalized.apiKey || decryptText(normalized.encryptedApiKey || '') : process.env.PLATFORM_IMAGE_API_KEY || '',
    apiSecret: normalized.keyMode === 'user' ? normalized.apiSecret || decryptText(normalized.encryptedApiSecret || '') : process.env.PLATFORM_IMAGE_API_SECRET || '',
  }

  if (!hydrated.endpoint?.trim()) throw new Error('请填写 Base URL')
  if (hydrated.keyMode === 'user' && !hydrated.apiKey?.trim()) throw new Error('请填写 API Key')

  const candidates = buildApiTypeDiscoveryUrls(hydrated.endpoint, hydrated.api_type)
  const errors = []
  for (const url of candidates) {
    const startedAt = Date.now()
    try {
      const result = await requestJson(url, { method: 'GET', headers: buildHeaders(hydrated) })
      const latencyMs = Date.now() - startedAt
      if (result.statusCode >= 200 && result.statusCode < 300) {
        const availableModels = normalizeDiscoveredModels(result.data, url)
        if (availableModels.length) {
          const selectedModels = availableModels.map((model) => model.id)
          return {
            availableModels,
            available_models: availableModels,
            selectedModels,
            selected_models: selectedModels,
            sourceType: 'api-switch-discovery',
            lastFetchedAt: new Date().toISOString(),
            latencyMs,
            latencyLevel: classifyLatency(latencyMs),
            response_ms: String(latencyMs),
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

async function existingProfile(openid, id) {
  if (!id) return null
  const matches = await list('modelProfiles', (item) => item.id === id && item.openid === openid)
  return matches[0] || null
}

function encryptedKeyForSave(profile, existing) {
  if (profile.keyMode !== 'user') return ''
  if (profile.apiKey) return encryptText(profile.apiKey)
  return existing?.encryptedApiKey || ''
}

function encryptedSecretForSave(profile, existing) {
  if (profile.keyMode !== 'user') return ''
  if (profile.apiSecret) return encryptText(profile.apiSecret)
  return existing?.encryptedApiSecret || ''
}

function withStoredSecrets(profile, existing) {
  return {
    ...profile,
    encryptedApiKey: profile.encryptedApiKey || existing?.encryptedApiKey || '',
    encryptedApiSecret: profile.encryptedApiSecret || existing?.encryptedApiSecret || '',
  }
}

exports.main = async function main(event = {}, context = {}) {
  try {
    const openid = context.OPENID || event.openid || 'mock-openid'
    if (event.action === 'list') {
      const profiles = await list('modelProfiles', (item) => item.openid === openid)
      return ok(profiles.map(sanitizeProfile))
    }

    if (event.action === 'save') {
      const profile = normalizeProfile(event.profile || {})
      const id = profile.id || `model-${Date.now()}`
      const existing = await existingProfile(openid, id)
      const saved = await upsert('modelProfiles', (item) => item.id === id && item.openid === openid, {
        ...profile,
        id,
        openid,
        encryptedApiKey: encryptedKeyForSave(profile, existing),
        encryptedApiSecret: encryptedSecretForSave(profile, existing),
        apiKey: undefined,
        apiSecret: undefined,
        updatedAt: new Date().toISOString(),
      })
      await syncApiSwitchCore({ ...profile, id }, openid)
      return ok(sanitizeProfile(saved))
    }

    if (event.action === 'discover') {
      const profile = normalizeProfile(event.profile || {})
      const id = profile.id || `model-${Date.now()}`
      const existing = await existingProfile(openid, id)
      const hydratedProfile = withStoredSecrets(profile, existing)
      const discovery = await discoverModels(hydratedProfile)
      const saved = await upsert('modelProfiles', (item) => item.id === id && item.openid === openid, {
        ...profile,
        ...discovery,
        id,
        openid,
        encryptedApiKey: encryptedKeyForSave(profile, existing),
        encryptedApiSecret: encryptedSecretForSave(profile, existing),
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
      const profile = normalizeProfile(event.profile || {})
      const existing = await existingProfile(openid, profile.id)
      const stored = withStoredSecrets(profile, existing)
      const hydrated = {
        ...stored,
        apiKey: stored.keyMode === 'user' ? stored.apiKey || decryptText(stored.encryptedApiKey || '') : process.env.PLATFORM_IMAGE_API_KEY || '',
        apiSecret: stored.keyMode === 'user' ? stored.apiSecret || decryptText(stored.encryptedApiSecret || '') : process.env.PLATFORM_IMAGE_API_SECRET || '',
      }
      const discoveryUrls = buildApiTypeDiscoveryUrls(hydrated.endpoint, hydrated.api_type)
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
