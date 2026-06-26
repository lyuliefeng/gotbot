const { randomUUID } = require('node:crypto')
const http = require('node:http')
const https = require('node:https')
const { protocolDefaults } = require('./types')
const { getWxServer } = require('./db')

const imageMimeByExtension = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

function validateGenerationInput(input) {
  const minDimension = input.mode === 'icon' ? 16 : 128
  if (!input.prompt?.trim()) throw new Error('请输入正向提示词')
  const isVideoMode = input.mode === 'txt2video' || input.mode === 'img2video'
  if (!input.modelId?.trim()) throw new Error(isVideoMode ? '请选择视频模型' : '请选择图像模型')
  if (input.width < minDimension || input.width > 4096) throw new Error(`宽度必须在 ${minDimension} 到 4096 之间`)
  if (input.height < minDimension || input.height > 4096) throw new Error(`高度必须在 ${minDimension} 到 4096 之间`)
  if (input.mode === 'img2video' && !input.referenceImage) throw new Error('图生视频需要先上传参考图')
}

async function testProfile(profile) {
  if (!profile.endpoint?.trim()) return { ok: false, message: '请填写 API 地址' }
  if (profile.keyMode === 'user' && !profile.apiKey?.trim()) return { ok: false, message: '请填写 API Key' }
  return {
    ok: true,
    message: `${profile.name} 已通过配置校验，默认协议 ${profile.apiProtocol || 'openai-images'}，路径 ${profile.apiPath || protocolDefaults[profile.apiProtocol || 'openai-images']}`,
  }
}

function previewDataUrl(input, index) {
  const label = input.mode.toUpperCase()
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}"><rect width="100%" height="100%" fill="#2563eb"/><text x="50%" y="46%" text-anchor="middle" fill="white" font-size="48" font-family="Arial" font-weight="700">${label}</text><text x="50%" y="56%" text-anchor="middle" fill="white" font-size="24" font-family="Arial">${index + 1}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

async function uploadPreviewIfPossible(taskId, assetId, dataUrl) {
  const wxServer = getWxServer()
  if (!wxServer || !wxServer.uploadFile) return { cloudFileId: '', remoteUrl: '', dataUrl }
  const base64 = decodeURIComponent(dataUrl.split(',')[1] || '')
  const buffer = Buffer.from(base64)
  const result = await wxServer.uploadFile({ cloudPath: `assets/${taskId}/${assetId}.svg`, fileContent: buffer })
  return { cloudFileId: result.fileID, remoteUrl: '', dataUrl: '' }
}

function normalizeEndpoint(endpoint, apiPath) {
  const base = endpoint.replace(/\/+$/, '')
  const path = (apiPath || '').replace(/^\/+/, '')
  return path ? `${base}/${path}` : base
}

function dataUrlToBuffer(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl)
  if (!match) return null
  return { mime: match[1], buffer: Buffer.from(match[2], 'base64') }
}

function extensionFromMime(mime) {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/gif') return 'gif'
  return 'png'
}

function extensionFromUrl(url) {
  const clean = url.split('?')[0]
  const match = /\.([a-zA-Z0-9]+)$/.exec(clean)
  const ext = match && match[1].toLowerCase()
  return imageMimeByExtension[ext] ? ext : 'png'
}

function requestBuffer(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const transport = parsed.protocol === 'http:' ? http : https
    const req = transport.request(parsed, options, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve({
        statusCode: res.statusCode || 0,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }))
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

async function readAgnesImage(result) {
  const image = (result.data && result.data[0]) || result.image || result.images?.[0] || result.output?.images?.[0]
  const candidate = typeof image === 'string' ? image : image?.url || image?.b64_json || image?.base64 || image?.dataUrl
  if (!candidate) throw new Error('Agnes 未返回图片地址')

  if (candidate.startsWith('data:')) return dataUrlToBuffer(candidate)

  const maybeBase64 = /^[A-Za-z0-9+/=]+$/.test(candidate) && candidate.length > 100
  if (maybeBase64) return { mime: 'image/png', buffer: Buffer.from(candidate, 'base64') }

  const response = await requestBuffer(candidate)
  if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(`下载 Agnes 图片失败：${response.statusCode}`)
  return {
    mime: String(response.headers['content-type'] || imageMimeByExtension[extensionFromUrl(candidate)] || 'image/png').split(';')[0],
    buffer: response.body,
    remoteUrl: candidate,
  }
}

async function callOpenAIImage(input, model, index) {
  if (!model.apiKey) throw new Error('API Key 未配置')
  const endpoint = normalizeEndpoint(model.endpoint || 'https://apihub.agnes-ai.com', model.apiPath || protocolDefaults['openai-images'])
  const requestBody = JSON.stringify({
    model: model.model || 'agnes-image-2.1-flash',
    prompt: input.negativePrompt ? `${input.prompt}\nNegative prompt: ${input.negativePrompt}` : input.prompt,
    size: `${input.width}x${input.height}`,
    n: 1,
  })
  const response = await requestBuffer(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${model.apiKey}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(requestBody),
    },
  }, requestBody)

  const text = response.body.toString('utf8')
  let payload
  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`Agnes 响应不是 JSON：${text.slice(0, 120)}`)
  }

  if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(payload.error?.message || payload.message || `图片生成请求失败：${response.statusCode}`)
  return readAgnesImage(payload)
}

async function uploadImageIfPossible(taskId, assetId, image) {
  const ext = extensionFromMime(image.mime)
  const wxServer = getWxServer()
  if (!wxServer || !wxServer.uploadFile) {
    return { cloudFileId: '', remoteUrl: image.remoteUrl || '', dataUrl: `data:${image.mime};base64,${image.buffer.toString('base64')}`, format: ext }
  }
  const result = await wxServer.uploadFile({ cloudPath: `assets/${taskId}/${assetId}.${ext}`, fileContent: image.buffer })
  return { cloudFileId: result.fileID, remoteUrl: image.remoteUrl || '', dataUrl: '', format: ext }
}

async function createGenerationTask(input, model, openid) {
  validateGenerationInput(input)
  const createdAt = new Date().toISOString()
  const taskId = `task-${randomUUID()}`
  const assetKind = input.mode === 'txt2video' || input.mode === 'img2video' ? 'video' : 'image'
  const assets = []

  for (let index = 0; index < input.batchSize; index += 1) {
    const assetId = `asset-${randomUUID()}`
    const shouldCallImageApi = ['agnes-image', 'openai-images'].includes(model.apiProtocol)
    const stored = shouldCallImageApi
      ? await uploadImageIfPossible(taskId, assetId, await callOpenAIImage(input, model, index))
      : await uploadPreviewIfPossible(taskId, assetId, previewDataUrl(input, index))
    assets.push({
      id: assetId,
      taskId,
      title: `${input.mode} ${index + 1}`,
      width: input.width,
      height: input.height,
      format: stored.format || (input.mode === 'gif' ? 'gif' : 'svg'),
      ...stored,
      assetKind,
      mediaType: 'image',
      createdAt,
      isFavorite: false,
    })
  }

  return {
    id: taskId,
    ...input,
    status: 'completed',
    assetKind,
    assets,
    createdAt,
    keyMode: model.keyMode,
    openid,
  }
}

module.exports = { validateGenerationInput, testProfile, createGenerationTask }
