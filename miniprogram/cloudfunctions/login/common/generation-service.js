const { randomUUID } = require('node:crypto')
const { protocolDefaults } = require('./types')
const { getWxServer } = require('./db')

function validateGenerationInput(input) {
  const minDimension = input.mode === 'icon' ? 16 : 128
  if (!input.prompt?.trim()) throw new Error('请输入正向提示词')
  if (!input.modelId?.trim()) throw new Error('请选择图像模型')
  if (input.width < minDimension || input.width > 4096) throw new Error(`宽度必须在 ${minDimension} 到 4096 之间`)
  if (input.height < minDimension || input.height > 4096) throw new Error(`高度必须在 ${minDimension} 到 4096 之间`)
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

async function createGenerationTask(input, model, openid) {
  validateGenerationInput(input)
  const createdAt = new Date().toISOString()
  const taskId = `task-${randomUUID()}`
  const assets = []

  for (let index = 0; index < input.batchSize; index += 1) {
    const assetId = `asset-${randomUUID()}`
    const stored = await uploadPreviewIfPossible(taskId, assetId, previewDataUrl(input, index))
    assets.push({
      id: assetId,
      taskId,
      title: `${input.mode} ${index + 1}`,
      width: input.width,
      height: input.height,
      format: input.mode === 'gif' ? 'gif' : 'svg',
      ...stored,
      mediaType: 'image',
      createdAt,
      isFavorite: false,
    })
  }

  return {
    id: taskId,
    ...input,
    status: 'completed',
    assets,
    createdAt,
    keyMode: model.keyMode,
    openid,
  }
}

module.exports = { validateGenerationInput, testProfile, createGenerationTask }
