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
    try {
      const result = await requestJson(url, { method: 'GET', headers: buildHeaders(hydrated) })
      if (result.statusCode >= 200 && result.statusCode < 300) {
        const availableModels = normalizeDiscoveredModels(result.data, url)
        if (availableModels.length) {
          return {
            availableModels,
            selectedModels: availableModels.map((model) => model.id),
            sourceType: 'api-switch-discovery',
            lastFetchedAt: new Date().toISOString(),
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
      return ok(sanitizeProfile(saved))
    }

    if (event.action === 'delete') {
      return ok(await remove('modelProfiles', (item) => item.id === event.id && item.openid === openid))
    }

    if (event.action === 'test') {
      const profile = event.profile || {}
      const hydrated = {
        ...profile,
        apiKey: profile.keyMode === 'user' ? profile.apiKey || decryptText(profile.encryptedApiKey || '') : process.env.PLATFORM_IMAGE_API_KEY || '',
        apiSecret: profile.keyMode === 'user' ? profile.apiSecret || decryptText(profile.encryptedApiSecret || '') : process.env.PLATFORM_IMAGE_API_SECRET || '',
      }
      return ok(await testProfile(hydrated))
    }

    return fail('unsupported action')
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'modelProfiles failed')
  }
}
