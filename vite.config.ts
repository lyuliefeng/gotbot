import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import type { Connect, Plugin } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'

const AGNES_VIDEOS_PATH = 'v1/videos'
const AGNES_LITTERBOX_UPLOAD_URL = 'https://litterbox.catbox.moe/resources/internals/api.php'
const AGNES_VIDEO_POLL_INTERVAL_MS = 5000
const AGNES_VIDEO_POLL_TIMEOUT_MS = 600000
const UPSTREAM_RETRY_STATUS = new Set([429, 500, 502, 503, 504, 524])
const UPSTREAM_MAX_RETRIES = 3
const UPSTREAM_RETRY_BASE_MS = 1500

type GenerationMode = 'txt2img' | 'img2img' | 'cover' | 'icon' | '3d' | 'gif' | 'txt2video' | 'img2video'

interface WebGenerationInput {
  mode: GenerationMode
  prompt: string
  negativePrompt: string
  modelId: string
  width: number
  height: number
  batchSize: number
  steps: number
  seed: number
  style: string
  referenceImage?: string
  modeOptions?: Record<string, string | number | boolean>
}

interface WebModelProfile {
  id: string
  name: string
  provider: 'openai-compatible' | 'local-preview'
  endpoint: string
  apiPath?: string
  apiProtocol?: string
  apiKey: string
  apiSecret?: string
  model: string
  kind: 'image' | 'text' | 'tts' | 'video'
}

interface WebGeneratedAsset {
  id: string
  taskId: string
  title: string
  width: number
  height: number
  format: 'png' | 'jpg' | 'webp' | 'gif' | 'mp4' | 'svg'
  dataUrl: string
  mediaType?: 'image' | 'video'
  remoteUrl?: string
  createdAt: string
  isFavorite: boolean
}

interface WebGenerationTask extends WebGenerationInput {
  id: string
  status: 'completed'
  error?: string
  isFavorite: boolean
  assets: WebGeneratedAsset[]
  createdAt: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function modelCatalogEndpoint(baseUrl: string): string {
  const url = new URL(baseUrl.trim())
  const segments = url.pathname.split('/').filter(Boolean)
  const v1Index = segments.lastIndexOf('v1')
  const prefix = v1Index >= 0 ? segments.slice(0, v1Index) : segments
  url.pathname = `/${[...prefix, 'v1', 'models'].join('/')}`
  url.search = ''
  return url.toString()
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(payload))
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  let body = ''
  for await (const chunk of request) {
    body += String(chunk)
  }
  return body.trim() ? JSON.parse(body) : {}
}

function safeUpstreamError(status: number, text: string): string {
  const message = text.trim().slice(0, 500)
  return message ? `模型列表获取失败: HTTP ${status} ${message}` : `模型列表获取失败: HTTP ${status}`
}

function safeGenerationUpstreamError(protocol: string, status: number, text: string): string {
  const message = text.trim().slice(0, 500)
  return message ? `生成失败: 协议 ${protocol} HTTP ${status} ${message}` : `生成失败: 协议 ${protocol} HTTP ${status}`
}

function errorMessageText(error: unknown): string {
  if (isRecord(error) && typeof error.message === 'string') return error.message
  return error instanceof Error ? error.message : String(error)
}

function errorCause(error: unknown): unknown {
  return error instanceof Error && 'cause' in error ? (error as Error & { cause?: unknown }).cause : undefined
}

function errorField(error: unknown, key: string): string {
  if (!isRecord(error)) return ''
  const value = error[key]
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function upstreamNetworkError(action: string, error: unknown): Error {
  const cause = errorCause(error)
  const message = errorMessageText(error)
  const causeCode = errorField(cause, 'code') || errorField(cause, 'name')
  const causeMessage = cause ? errorMessageText(cause) : ''
  const detail = causeCode && causeMessage
    ? `${causeCode}: ${causeMessage}`
    : causeMessage || causeCode
  const suffix = detail && detail !== message ? `（${detail}）` : ''
  return new Error(`${action}: ${message}${suffix}`, { cause: error })
}

async function fetchUpstream(endpoint: string | URL, init: RequestInit, action: string): Promise<Response> {
  try {
    return await fetch(endpoint, init)
  } catch (error) {
    throw upstreamNetworkError(action, error)
  }
}

function joinApiEndpoint(base: string, customPath: string | undefined, defaultPath: string): string {
  const suffix = (customPath?.trim() || defaultPath).replace(/^\/+/, '')
  return `${base.replace(/\/+$/, '')}/${suffix}`
}

function validateWebGenerationInput(input: WebGenerationInput): void {
  const minDimension = input.mode === 'icon' ? 16 : 128
  if (!input.prompt?.trim()) throw new Error('请输入正向提示词')
  if (!input.modelId?.trim()) throw new Error(input.mode === 'txt2video' || input.mode === 'img2video' ? '请选择视频模型' : '请选择图像模型')
  if (input.mode === 'img2img' && !input.referenceImage?.trim()) throw new Error('图生图需要先上传参考图')
  if (input.mode === 'img2video' && !input.referenceImage?.trim()) throw new Error('图生视频需要先上传参考图')
  if (!Number.isFinite(input.width) || input.width < minDimension || input.width > 4096) throw new Error(`宽度必须在 ${minDimension} 到 4096 之间`)
  if (!Number.isFinite(input.height) || input.height < minDimension || input.height > 4096) throw new Error(`高度必须在 ${minDimension} 到 4096 之间`)
  if (!Number.isInteger(input.batchSize) || input.batchSize < 1 || input.batchSize > 4) throw new Error('批量数量必须在 1 到 4 之间')
  if (!Number.isInteger(input.steps) || input.steps < 1 || input.steps > 80) throw new Error('生成步数必须在 1 到 80 之间')
}

function validateWebGenerationModel(model: WebModelProfile): void {
  const label = model?.kind === 'video' ? '视频' : '图像'
  if (!model || model.provider === 'local-preview') throw new Error(`请先配置并选择真实${label}模型`)
  if (model.provider !== 'openai-compatible') throw new Error('不支持的模型提供方')
  if (!model.endpoint?.trim()) throw new Error(`请填写${label}模型 API 地址`)
  if (!model.apiKey?.trim()) throw new Error(`请填写${label}模型 API Key`)
  if (!model.model?.trim()) throw new Error(`请填写${label}模型 ID`)
}

async function postGenerationJson(endpoint: string, apiKey: string, protocol: string, body: unknown): Promise<unknown> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt <= UPSTREAM_MAX_RETRIES; attempt++) {
    const upstreamResponse = await fetchUpstream(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }, `生成请求网络失败: 协议 ${protocol} POST ${endpoint}`)
    const text = await upstreamResponse.text()
    if (!upstreamResponse.ok) {
      if (UPSTREAM_RETRY_STATUS.has(upstreamResponse.status) && attempt < UPSTREAM_MAX_RETRIES) {
        lastError = new Error(safeGenerationUpstreamError(protocol, upstreamResponse.status, text))
        await sleep(UPSTREAM_RETRY_BASE_MS * Math.pow(2, attempt))
        continue
      }
      throw new Error(safeGenerationUpstreamError(protocol, upstreamResponse.status, text))
    }
    try {
      return text ? JSON.parse(text) : {}
    } catch (error) {
      throw new Error(`解析生成响应失败: ${error instanceof Error ? error.message : String(error)}; ${text.slice(0, 500)}`, { cause: error })
    }
  }
  throw lastError ?? new Error(`生成请求重试耗尽: 协议 ${protocol} POST ${endpoint}`)
}

function collectImageOutputs(payload: unknown): Array<Record<string, unknown>> {
  if (!isRecord(payload)) return []
  const outputs: Array<Record<string, unknown>> = []
  if (Array.isArray(payload.data)) outputs.push(...payload.data.filter(isRecord))
  if (Array.isArray(payload.images)) outputs.push(...payload.images.filter(isRecord))
  if (isRecord(payload.output) && typeof payload.output.url === 'string') outputs.push({ url: payload.output.url })
  if (Array.isArray(payload.choices)) {
    for (const choice of payload.choices) {
      if (!isRecord(choice) || !isRecord(choice.message)) continue
      const content = choice.message.content
      if (typeof content === 'string') {
        const match = content.match(/https?:\/\/\S+/)
        if (match) outputs.push({ url: match[0] })
      }
      if (Array.isArray(content)) {
        for (const item of content) {
          if (!isRecord(item)) continue
          if (isRecord(item.image_url) && typeof item.image_url.url === 'string') outputs.push({ url: item.image_url.url })
          if (item.type === 'image_url' && typeof item.url === 'string') outputs.push({ url: item.url })
        }
      }
    }
  }
  return outputs
}

function imageCandidate(image: Record<string, unknown>): string {
  for (const key of ['url', 'image_url', 'output_url', 'b64_json', 'base64', 'dataUrl']) {
    const value = image[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function imageExtensionFromMime(mime: string): WebGeneratedAsset['format'] {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('gif')) return 'gif'
  return 'png'
}

function imageExtensionFromUrl(url: string): WebGeneratedAsset['format'] {
  const clean = url.split('?')[0] ?? ''
  const match = /\.([a-zA-Z0-9]+)$/.exec(clean)
  const ext = match?.[1]?.toLowerCase()
  return ext === 'jpg' || ext === 'webp' || ext === 'gif' ? ext : 'png'
}

function isVideoMode(mode: GenerationMode): boolean {
  return mode === 'txt2video' || mode === 'img2video'
}

function numberModeOption(input: WebGenerationInput, key: string, fallback: number): number {
  const value = input.modeOptions?.[key]
  const numberValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numberValue) && numberValue > 0 ? Math.round(numberValue) : fallback
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeSearchKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
}

function findStringByKeys(value: unknown, keys: string[]): string | undefined {
  const normalizedKeys = new Set(keys.map(normalizeSearchKey))
  if (typeof value === 'string') return undefined
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringByKeys(item, keys)
      if (found) return found
    }
    return undefined
  }
  if (!isRecord(value)) return undefined
  for (const [key, item] of Object.entries(value)) {
    if (normalizedKeys.has(normalizeSearchKey(key)) && typeof item === 'string' && item.trim()) return item.trim()
    const found = findStringByKeys(item, keys)
    if (found) return found
  }
  return undefined
}

function findAgnesVideoPollId(value: unknown): string | undefined {
  const direct = findStringByKeys(value, ['videoid', 'video_id'])
  if (direct) return direct
  const id = findStringByKeys(value, ['id'])
  return id?.toLowerCase().startsWith('video') ? id : undefined
}

function findVideoUrl(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const text = value.trim()
    return text.startsWith('http') && text.includes('.mp4') ? text : undefined
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findVideoUrl(item)
      if (found) return found
    }
    return undefined
  }
  if (!isRecord(value)) return undefined
  for (const [key, item] of Object.entries(value)) {
    const normalized = normalizeSearchKey(key)
    if ((normalized === 'videourl' || normalized === 'url' || normalized === 'remixedfromvideoid') && typeof item === 'string') {
      const text = item.trim()
      if (text.startsWith('http')) return text
    }
    const found = findVideoUrl(item)
    if (found) return found
  }
  return undefined
}

function agnesVideoPollEndpoint(createEndpoint: string): string {
  const url = new URL(createEndpoint)
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.at(-1) === 'videos') segments.pop()
  if (segments.at(-1) === 'v1') segments.pop()
  segments.push('agnesapi')
  url.pathname = `/${segments.join('/')}`
  url.search = ''
  return url.toString()
}

function decodeImageDataUrl(dataUrl: string): { mime: string; bytes: Buffer } {
  const match = /^data:([^;,]+)(;base64)?,(.+)$/.exec(dataUrl)
  if (!match) throw new Error('参考图必须是 data URL 或 HTTP 图片地址')
  return {
    mime: match[1],
    bytes: match[2] ? Buffer.from(match[3], 'base64') : Buffer.from(decodeURIComponent(match[3])),
  }
}

function imageExtension(mime: string): string {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('gif')) return 'gif'
  return 'png'
}

async function resolveAgnesInputImageUrl(input: WebGenerationInput): Promise<string> {
  const referenceImage = input.referenceImage?.trim()
  if (!referenceImage) throw new Error('需要先上传或拖入参考图')
  if (referenceImage.startsWith('http://') || referenceImage.startsWith('https://')) return referenceImage
  const { mime, bytes } = decodeImageDataUrl(referenceImage)
  const form = new FormData()
  form.set('reqtype', 'fileupload')
  form.set('time', '1h')
  const fileBytes = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(fileBytes).set(bytes)
  form.set('fileToUpload', new Blob([fileBytes], { type: mime }), `reference.${imageExtension(mime)}`)
  const response = await fetchUpstream(AGNES_LITTERBOX_UPLOAD_URL, {
    method: 'POST',
    body: form,
  }, `上传 Agnes 参考图网络失败: POST ${AGNES_LITTERBOX_UPLOAD_URL}`)
  const text = await response.text()
  if (!response.ok || !text.trim().startsWith('http')) throw new Error(`上传 Agnes 参考图失败: HTTP ${response.status} ${text}`)
  return text.trim()
}

async function imageToAssetData(image: Record<string, unknown>): Promise<{ dataUrl: string; remoteUrl?: string; format: WebGeneratedAsset['format'] }> {
  const candidate = imageCandidate(image)
  if (!candidate) throw new Error('图像模型返回了空图片地址')
  if (candidate.startsWith('data:')) {
    const mime = candidate.slice(5, candidate.indexOf(';') > 0 ? candidate.indexOf(';') : undefined)
    return { dataUrl: candidate, format: imageExtensionFromMime(mime) }
  }
  const isBase64 = Boolean(image.b64_json || image.base64) || (/^[A-Za-z0-9+/=]+$/.test(candidate) && candidate.length > 100)
  if (isBase64) return { dataUrl: `data:image/png;base64,${candidate}`, format: 'png' }
  if (!/^https?:\/\//.test(candidate)) throw new Error('图像模型返回了无法识别的图片格式')

  const response = await fetchUpstream(candidate, {}, `下载生成图片网络失败: GET ${candidate}`)
  const contentLength = Number(response.headers.get('content-length') ?? 0)
  if (contentLength > 50 * 1024 * 1024) throw new Error('生成图片响应体过大')
  if (!response.ok) throw new Error(`下载生成图片失败: HTTP ${response.status}`)
  const mime = response.headers.get('content-type')?.split(';')[0] ?? `image/${imageExtensionFromUrl(candidate)}`
  const bytes = Buffer.from(await response.arrayBuffer())
  return {
    dataUrl: `data:${mime};base64,${bytes.toString('base64')}`,
    remoteUrl: candidate,
    format: imageExtensionFromMime(mime),
  }
}

async function pollAgnesVideo(model: WebModelProfile, videoId: string): Promise<unknown> {
  const createEndpoint = joinApiEndpoint(model.endpoint, model.apiPath, AGNES_VIDEOS_PATH)
  const pollEndpoint = agnesVideoPollEndpoint(createEndpoint)
  const startedAt = Date.now()
  let consecutiveErrors = 0
  while (Date.now() - startedAt <= AGNES_VIDEO_POLL_TIMEOUT_MS) {
    const url = new URL(pollEndpoint)
    url.searchParams.set('video_id', videoId)
    let response: Response
    try {
      response = await fetchUpstream(url, {
        headers: {
          Authorization: `Bearer ${model.apiKey.trim()}`,
        },
      }, `轮询 Agnes 视频网络失败: GET ${url.toString()}`)
    } catch (error) {
      consecutiveErrors++
      if (consecutiveErrors >= 5) throw error
      await sleep(AGNES_VIDEO_POLL_INTERVAL_MS)
      continue
    }
    const text = await response.text()
    if (!response.ok) {
      if (UPSTREAM_RETRY_STATUS.has(response.status)) {
        consecutiveErrors++
        if (consecutiveErrors >= 5) throw new Error(safeGenerationUpstreamError('agnes-video', response.status, text))
        await sleep(AGNES_VIDEO_POLL_INTERVAL_MS)
        continue
      }
      throw new Error(safeGenerationUpstreamError('agnes-video', response.status, text))
    }
    consecutiveErrors = 0
    const payload = text ? JSON.parse(text) : {}
    const status = (findStringByKeys(payload, ['status', 'state']) ?? 'running').toLowerCase()
    if (['completed', 'complete', 'succeeded', 'success', 'done'].includes(status)) return payload
    if (['failed', 'failure', 'error', 'cancelled', 'canceled'].includes(status)) throw new Error(`Agnes 视频任务失败: ${text}`)
    await sleep(AGNES_VIDEO_POLL_INTERVAL_MS)
  }
  throw new Error(`Agnes 视频任务超时，videoId: ${videoId}`)
}

async function createWebAgnesVideoGeneration(input: WebGenerationInput, model: WebModelProfile): Promise<WebGenerationTask> {
  validateWebGenerationInput(input)
  validateWebGenerationModel(model)
  if (!isVideoMode(input.mode)) throw new Error('Agnes 视频协议只能用于视频模式')
  const endpoint = joinApiEndpoint(model.endpoint, model.apiPath, AGNES_VIDEOS_PATH)
  const body: Record<string, unknown> = {
    model: model.model.trim(),
    prompt: input.prompt.trim(),
    width: input.width,
    height: input.height,
    num_frames: numberModeOption(input, 'numFrames', 81),
    frame_rate: numberModeOption(input, 'frameRate', 24),
  }
  if (input.negativePrompt?.trim()) body.negative_prompt = input.negativePrompt.trim()
  if (input.seed > 0) body.seed = input.seed
  if (input.mode === 'img2video') body.image = await resolveAgnesInputImageUrl(input)

  const created = await postGenerationJson(endpoint, model.apiKey, 'agnes-video', body)
  const videoId = findAgnesVideoPollId(created)
  if (!videoId) throw new Error(`Agnes 视频模型未返回 videoId/taskId: ${JSON.stringify(created)}`)
  const completed = await pollAgnesVideo(model, videoId)
  const videoUrl = findVideoUrl(completed)
  if (!videoUrl) throw new Error(`Agnes 视频任务完成但未返回视频 URL: ${JSON.stringify(completed)}`)

  const id = `task-${randomUUID()}`
  const createdAt = new Date().toISOString()
  return {
    id,
    ...input,
    modelId: model.id,
    status: 'completed',
    error: undefined,
    isFavorite: false,
    assets: [{
      id: `asset-${randomUUID()}`,
      taskId: id,
      title: `${input.mode} 1`,
      width: input.width,
      height: input.height,
      format: 'mp4',
      dataUrl: videoUrl,
      mediaType: 'video',
      remoteUrl: videoUrl,
      createdAt,
      isFavorite: false,
    }],
    createdAt,
  }
}

async function createWebImageGeneration(input: WebGenerationInput, model: WebModelProfile): Promise<WebGenerationTask> {
  validateWebGenerationInput(input)
  validateWebGenerationModel(model)
  const protocol = model.apiProtocol || 'openai-images'
  if (protocol === 'agnes-video') return createWebAgnesVideoGeneration(input, model)
  if (protocol !== 'openai-images' && protocol !== 'agnes-image' && protocol !== 'multimodal-chat') {
    throw new Error(`Web 版本暂未实现该生成协议: ${protocol}`)
  }
  if (isVideoMode(input.mode)) throw new Error(`Web 版本暂未实现该生成协议: ${protocol}`)

  const endpoint = protocol === 'multimodal-chat'
    ? joinApiEndpoint(model.endpoint, model.apiPath, 'v1/chat/completions')
    : joinApiEndpoint(model.endpoint, model.apiPath, 'v1/images/generations')
  const isAgnes = protocol === 'agnes-image'

  function buildBody(): Record<string, unknown> {
    if (protocol === 'multimodal-chat') {
      return {
        model: model.model.trim(),
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: input.prompt.trim() },
            ...(input.referenceImage?.trim() ? [{ type: 'image_url', image_url: { url: input.referenceImage.trim() } }] : []),
          ],
        }],
        n: input.batchSize,
        size: `${input.width}x${input.height}`,
      }
    }
    return {
      model: model.model.trim(),
      prompt: input.negativePrompt?.trim() ? `${input.prompt.trim()}\nNegative prompt: ${input.negativePrompt.trim()}` : input.prompt.trim(),
      ...(isAgnes ? {} : { n: input.batchSize }),
      size: `${input.width}x${input.height}`,
      ...(!isAgnes && input.seed > 0 ? { seed: input.seed } : {}),
      ...(isAgnes
        ? { extra_body: {
            response_format: 'url',
            ...(input.mode === 'img2img' && input.referenceImage?.trim()
              ? { image: [input.referenceImage.trim()] }
              : {}),
          }}
        : {}),
    }
  }

  let images: Array<Record<string, unknown>> = []
  if (isAgnes && input.batchSize > 1) {
    for (let i = 0; i < input.batchSize; i++) {
      const payload = await postGenerationJson(endpoint, model.apiKey, protocol, buildBody())
      images.push(...collectImageOutputs(payload))
    }
  } else {
    const payload = await postGenerationJson(endpoint, model.apiKey, protocol, buildBody())
    images = collectImageOutputs(payload)
  }
  if (!images.length) throw new Error(`图像模型未返回图片: 协议 ${protocol} POST ${endpoint}`)

  const id = `task-${randomUUID()}`
  const createdAt = new Date().toISOString()
  const assets = await Promise.all(images.map(async (image, index): Promise<WebGeneratedAsset> => {
    const assetData = await imageToAssetData(image)
    return {
      id: `asset-${randomUUID()}`,
      taskId: id,
      title: `${input.mode}-${index + 1}`,
      width: input.width,
      height: input.height,
      mediaType: 'image',
      createdAt,
      isFavorite: false,
      ...assetData,
    }
  }))

  return {
    id,
    ...input,
    modelId: model.id,
    status: 'completed',
    error: undefined,
    isFavorite: false,
    assets,
    createdAt,
  }
}

function apiProxyPlugin(): Plugin {
  const attach = (middlewares: Connect.Server): void => {
    middlewares.use('/api/model-catalog', async (request, response) => {
      if (request.method !== 'POST') {
        writeJson(response, 405, { error: 'Method Not Allowed' })
        return
      }

      try {
        const body = await readJsonBody(request)
        if (!isRecord(body) || typeof body.endpoint !== 'string' || typeof body.apiKey !== 'string') {
          writeJson(response, 400, { error: '请填写 API 地址和 API Key' })
          return
        }

        const endpoint = modelCatalogEndpoint(body.endpoint)
        const apiKey = body.apiKey.trim()
        if (!apiKey) {
          writeJson(response, 400, { error: '请填写 API Key' })
          return
        }

        const upstreamResponse = await fetchUpstream(endpoint, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        }, `模型列表网络失败: GET ${endpoint}`)
        const text = await upstreamResponse.text()
        if (!upstreamResponse.ok) {
          writeJson(response, 502, { error: safeUpstreamError(upstreamResponse.status, text) })
          return
        }

        response.statusCode = 200
        response.setHeader('Content-Type', upstreamResponse.headers.get('content-type') ?? 'application/json; charset=utf-8')
        response.end(text)
      } catch (error) {
        writeJson(response, 502, { error: error instanceof Error ? error.message : '模型列表代理请求失败' })
      }
    })

    middlewares.use('/api/generation', async (request, response) => {
      if (request.method !== 'POST') {
        writeJson(response, 405, { error: 'Method Not Allowed' })
        return
      }

      try {
        const body = await readJsonBody(request)
        if (!isRecord(body) || !isRecord(body.input) || !isRecord(body.model)) {
          writeJson(response, 400, { error: '请提供生成参数和模型配置' })
          return
        }

        const task = await createWebImageGeneration(body.input as unknown as WebGenerationInput, body.model as unknown as WebModelProfile)
        writeJson(response, 200, task)
      } catch (error) {
        writeJson(response, 502, { error: error instanceof Error ? error.message : 'Web 生成代理请求失败' })
      }
    })
  }

  return {
    name: 'gotbot-api-proxy',
    configureServer(server) {
      attach(server.middlewares)
    },
    configurePreviewServer(server) {
      attach(server.middlewares)
    },
  }
}

export default defineConfig({
  plugins: [vue(), tailwindcss(), apiProxyPlugin()],
  clearScreen: false,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 3030,
    strictPort: true,
  },
})
