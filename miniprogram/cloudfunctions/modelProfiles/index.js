const http = require('node:http')
const https = require('node:https')
const { createHash, randomUUID } = require('node:crypto')
const { decryptText, encryptText } = require('./common/crypto')
const { list, remove, upsert } = require('./common/db')
const { testProfile } = require('./common/generation-service')
const { fail, ok } = require('./common/types')

const BUILTIN_DEFAULT_PROFILE_IDS = new Set([
  'platform-agnes-image',
  'platform-gogoing-text',
  'platform-gogoing-image',
  'platform-agnes-video',
  'openai-gpt-image-2',
])

function resolveOpenid(context, event) {
  const openid = context.OPENID
  if (!openid) throw new Error('认证失败：无法获取用户身份')
  return openid
}

function sanitizeProfile(profile) {
  const { encryptedApiKey, apiKey, ...rest } = profile
  return { ...rest, apiKey: '' }
}

function isBuiltinDefaultProfile(profile) {
  return Boolean(profile && (profile.keyMode === 'platform' || BUILTIN_DEFAULT_PROFILE_IDS.has(profile.id)))
}

const PROFILE_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/

const PROFILE_WHITELIST = [
  'name', 'endpoint', 'apiPath', 'apiProtocol', 'model', 'kind', 'keyMode', 'comment', 'latencyMs',
]

function whitelistProfile(profile) {
  const out = {}
  for (const key of PROFILE_WHITELIST) {
    if (profile[key] !== undefined) out[key] = profile[key]
  }
  return out
}

function normalizeEndpoint(endpoint) {
  return String(endpoint || '').replace(/\/+$/, '')
}

const PRIVATE_IP_RE = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|0\.|169\.254\.|::1|fc|fd|fe80)/

function isPrivateHost(hostname) {
  return PRIVATE_IP_RE.test(hostname) || hostname === 'localhost' || hostname.endsWith('.local')
}

function modelsUrl(endpoint) {
  const base = normalizeEndpoint(endpoint)
  return /\/v1$/i.test(base) ? `${base}/models` : `${base}/v1/models`
}

function classifyModel(item) {
  const raw = String(item.id || item.name || item.model || '').toLowerCase()
  if (/video|视频|生视频|文生视频|图生视频|wan|kling|hailuo|runway|pika|luma|sora|veo|seedance/.test(raw)) return 'video'
  if (/image|图片|图像|生图|文生图|图生图|img|flux|dall|gpt-image|midjourney|stable|sdxl|sd-|dream|recraft|ideogram|kolors|agnes-image/.test(raw)) return 'image'
  if (/vision|vl|omni|multimodal|chat|text|gpt|qwen|deepseek|claude|gemini|llama|kimi|agnes-\d|flash|turbo|instruct|embedding/.test(raw)) return 'text'
  return 'text'
}

function normalizeModels(payload, latencyMs) {
  const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : Array.isArray(payload) ? payload : []
  return items.map((item) => {
    const id = String(item.id || item.name || item.model || '').replace(/^models\//, '')
    const name = item.name || id
    return { id, name, kind: classifyModel({ id, name }), latencyMs }
  }).filter((item) => item.id)
}

function requestJson(url, apiKey) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      reject(new Error('仅支持 HTTP/HTTPS 协议'))
      return
    }
    if (isPrivateHost(parsed.hostname)) {
      reject(new Error('不允许访问内部网络地址'))
      return
    }
    const transport = parsed.protocol === 'http:' ? http : https
    const req = transport.request(parsed, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      timeout: 12000,
    }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let data = {}
        try { data = text ? JSON.parse(text) : {} } catch (error) { data = { raw: text } }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(data.error?.message || data.message || `模型拉取失败：${res.statusCode}`))
          return
        }
        const latencyMs = Date.now() - startedAt
        resolve({ raw: data, models: normalizeModels(data, latencyMs), latencyMs })
      })
    })
    req.on('error', reject)
    req.setTimeout(12000, () => req.destroy(new Error('模型拉取请求超时')))
    req.end()
  })
}

function hydrate(profile) {
  return {
    ...profile,
    apiKey: decryptText(profile.encryptedApiKey || '') || profile.apiKey || '',
  }
}

function stableProfileId(profile) {
  const hash = createHash('sha1')
    .update([normalizeEndpoint(profile.endpoint), profile.model || '', profile.kind || 'text'].join('|'))
    .digest('hex')
    .slice(0, 20)
  return `model-${hash}`
}

exports.main = async function main(event = {}, context = {}) {
  try {
    if (event.action === 'discover') {
      const profile = hydrate({ ...whitelistProfile(event.profile || {}), apiKey: event.profile?.apiKey || '' })
      if (!profile.endpoint?.trim()) throw new Error('请填写 API 地址')
      if (!profile.apiKey?.trim()) throw new Error(profile.keyMode === 'user' ? '请填写 API Key' : '平台 API Key 未配置')
      return ok(await requestJson(modelsUrl(profile.endpoint), profile.apiKey))
    }

    if (event.action === 'test' && event.profile && !event.profileId && !event.profile.id) {
      return ok(await testProfile(hydrate({ ...whitelistProfile(event.profile), apiKey: event.profile.apiKey || '' })))
    }

    const openid = resolveOpenid(context, event)

    if (event.action === 'list') {
      const profiles = await list('modelProfiles', (item) => item.openid === openid)
      return ok(profiles.filter((profile) => !isBuiltinDefaultProfile(profile)).map(sanitizeProfile))
    }

    if (event.action === 'save') {
      const profile = event.profile || {}
      const id = profile.id && PROFILE_ID_RE.test(profile.id) ? profile.id : `model-${randomUUID()}`
      const sanitized = whitelistProfile(profile)
      const saved = await upsert('modelProfiles', (item) => item.id === id && item.openid === openid, {
        ...sanitized,
        id,
        openid,
        keyMode: 'user',
        encryptedApiKey: encryptText(profile.apiKey || ''),
        apiKey: undefined,
        updatedAt: new Date().toISOString(),
      })
      return ok(sanitizeProfile(saved))
    }

    if (event.action === 'saveMany') {
      const profiles = Array.isArray(event.profiles) ? event.profiles : []
      if (!profiles.length) throw new Error('没有可导入的模型')
      const saved = []
      for (const profile of profiles) {
        const id = profile.id && PROFILE_ID_RE.test(profile.id) ? profile.id : stableProfileId(profile)
        const sanitized = whitelistProfile(profile)
        const item = await upsert('modelProfiles', (existing) => existing.id === id && existing.openid === openid, {
          ...sanitized,
          id,
          openid,
          keyMode: 'user',
          encryptedApiKey: encryptText(profile.apiKey || ''),
          apiKey: undefined,
          updatedAt: new Date().toISOString(),
        })
        saved.push(sanitizeProfile(item))
      }
      return ok(saved)
    }

    if (event.action === 'delete') {
      if (!event.id) throw new Error('缺少模型 ID')
      const removed = await remove('modelProfiles', (item) => item.id === event.id && item.openid === openid)
      if (!removed) throw new Error('模型不存在或无权删除')
      return ok(true)
    }

    if (event.action === 'test') {
      const profileId = event.profileId || event.profile?.id
      if (!profileId) throw new Error('缺少模型 ID')
      const profiles = await list('modelProfiles', (item) => item.id === profileId && item.openid === openid)
      const stored = profiles[0]
      if (!stored) throw new Error('模型不存在，请先保存')
      return ok(await testProfile(hydrate(stored)))
    }

    throw new Error('不支持的操作')
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'modelProfiles failed')
  }
}
